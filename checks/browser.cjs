'use strict';
// Проверка в отдельном Edge без окна. Для самой игры Node и Edge не требуются.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dir = path.resolve(__dirname, '../.checks'); fs.mkdirSync(dir, { recursive: true });
const profile = path.join(dir, 'edge-' + Date.now());
const port = fs.readFileSync(path.resolve(__dirname, '../.server-port'), 'utf8').trim();
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let ws; let command; const errors = []; const failed = [];
(async () => {
  try {
    let debugPort;
    for (let i = 0; i < 100; i++) {
      try { debugPort = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
      await sleep(100);
    }
    assert.ok(debugPort, 'Edge did not start');
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0; const pending = new Map();
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params }));
      setTimeout(() => { if (pending.has(key)) { pending.delete(key); reject(new Error('CDP timeout: ' + method)); } }, 10000).unref();
    });
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); if (msg.error) p?.reject(new Error(JSON.stringify(msg.error))); else p?.resolve(msg.result); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
      if (msg.method === 'Network.loadingFailed') failed.push(msg.params.errorText);
    };
    await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const state = () => evaluate(`(() => { const s=flightGame.scene.getScene('Flight'); const m=s.model; return {phase:m.phase,x:m.x,y:m.y,vx:m.vx,vy:m.vy,fuel:m.fuel,coins:m.coins,distance:m.distance,angle:m.angle,scrollX:s.cameras.main.scrollX,scrollY:s.cameras.main.scrollY,error:!document.getElementById('error').hidden,result:!document.getElementById('result').hidden,pickups:s.pickups.getLength()}; })()`);
    const box = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const mouse = (type, pos) => command('Input.dispatchMouseEvent', { type, ...pos, button: 'left', clickCount: 1 });
    const click = async selector => { const pos=await box(selector); await mouse('mousePressed',pos); await mouse('mouseReleased',pos); };
    const screenshot = async filename => { const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(dir,filename), Buffer.from(shot.data,'base64')); };
    const setSlider = (id,value) => evaluate(`(() => {const input=document.getElementById(${JSON.stringify(id)});input.value=${value};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    let initial;
    for (let i=0;i<100;i++) { try { initial=await state(); if(initial.phase==='ready') break; } catch {} await sleep(100); }
    assert.equal(initial?.phase,'ready'); assert.equal(initial.error,false); assert.ok(initial.pickups>20);
    assert.equal(await evaluate("document.getElementById('flight-tip')"),null);
    assert.equal(await evaluate("document.getElementById('angle').max"),'50');
    // Проверяем настоящую расстановку: подпись и мировая позиция каждого знака.
    const checkMarkers = async () => {
      const markers = await evaluate(`(() => {const s=flightGame.scene.getScene('Flight'); s.populate(5000); return s.decorations.getChildren().filter(o=>o.markerDistance!=null&&typeof o.text==='string').map(o=>({distance:o.markerDistance,text:o.text,meters:(o.x-s.model.startX)/FlightRules.pixelsPerMeter}));})()`);
      assert.ok(markers.length>=9);
      markers.forEach((marker,i)=>{assert.equal(marker.distance,(i+1)*50);assert.equal(marker.text,marker.distance+' м');assert.ok(Math.abs(marker.meters-marker.distance)<1e-7);});
    };
    await checkMarkers();
    const shapes = await evaluate(`(() => {const s=flightGame.scene.getScene('Flight');return Array.from({length:5},(_,i)=>{const base=480+i*620;return s.pickups.getChildren().filter(o=>o.kind==='coin'&&o.y>0&&o.x>=base&&o.x<=base+230).map(o=>[o.x-base,Math.round(o.y-(325+Math.sin(i*1.9)*100))]);});})()`);
    assert.equal(new Set(shapes.map(shape=>JSON.stringify(shape))).size,5);
    assert.equal(shapes[1].every(point=>point[1]===0),true);
    assert.equal(shapes[4].length,9);
    // Ограничение срабатывает и у самого ползунка, и при управлении стрелками.
    await evaluate("document.getElementById('angle').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
    assert.equal((await state()).angle,50);
    await checkMarkers();
    await evaluate("document.getElementById('angle').blur()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    assert.equal((await state()).angle,50);
    await evaluate("document.getElementById('angle').value=40;flightGame.scene.getScene('Flight').adjustAngle()");
    await screenshot('desktop.png');
    await evaluate("document.getElementById('angle').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await sleep(100); assert.equal((await state()).angle,41);
    const pos=await box('#action'); await mouse('mousePressed',pos); await sleep(550);
    const powered=await state(); assert.equal(powered.phase,'flying'); assert.ok(powered.fuel<96); assert.ok(powered.vy<0);
    assert.equal(powered.vx, await evaluate('FlightRules.horizontalSpeed'));
    await mouse('mouseReleased',pos); await sleep(450);
    const coast=await state(); assert.ok(Math.abs(coast.fuel-powered.fuel)<1); assert.ok(coast.vy>powered.vy);
    assert.equal(coast.vx,powered.vx);
    assert.ok(coast.scrollX>0); await screenshot('flying.png');
    for(let i=0;i<160;i++){if((await state()).phase==='landed')break;await sleep(100);}
    const landed=await state(); assert.equal(landed.phase,'landed'); assert.equal(landed.result,true);
    await screenshot('result.png'); await click('#again');
    const reset=await state(); assert.equal(reset.phase,'ready'); assert.equal(reset.fuel,100); assert.equal(reset.distance,0); assert.equal(reset.coins,0);
    // Контрольный сценарий сбора через настоящий цикл игры.
    await evaluate(`(() => {const s=flightGame.scene.getScene('Flight'); s.launch(); s.pickups.clear(true,true); s.model.vx=200; s.model.vy=0; s.model.fuel=30; s.addPickup(s.model.x+30,s.model.y,'coin'); s.addPickup(s.model.x+70,s.model.y,'fuel');})()`);
    await sleep(450); const collected=await state(); assert.equal(collected.coins,1); assert.equal(collected.fuel,60);
    // Пустой бак не даёт тягу, после подбора тяга снова включается.
    await evaluate(`(() => {const s=flightGame.scene.getScene('Flight');s.model.fuel=0;s.model.vy=-200;})()`);
    await mouse('mousePressed',await box('#action')); await sleep(200); const empty=await state(); assert.equal(empty.fuel,0); assert.ok(empty.vy>-200);
    await evaluate(`(() => {const s=flightGame.scene.getScene('Flight');s.addPickup(s.model.x,s.model.y,'fuel');})()`);
    await sleep(200); const refueled=await state(); assert.ok(refueled.fuel>20); assert.ok(refueled.vy<empty.vy);
    await mouse('mouseReleased',await box('#action')); await click('#reset');
    await evaluate("document.getElementById('action').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32}); await sleep(200);
    assert.ok((await state()).fuel<99);
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await click('#reset');
    // Все надписи топлива занимают одно место на узких экранах, включая пустой бак.
    for (const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
      await sleep(150);
      const layouts = await evaluate(`(() => {const s=flightGame.scene.getScene('Flight');const states=[{fuel:100,lifting:false},{fuel:50,lifting:true},{fuel:0,lifting:false}];return states.map(status=>{Object.assign(s.model,status);s.updateHud();return ['.dashboard','.arena','#fuel-note'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [r.x,r.y,r.width,r.height];});});})()`);
      assert.deepEqual(layouts[0],layouts[1]); assert.deepEqual(layouts[0],layouts[2]);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
      assert.equal(await evaluate('document.documentElement.scrollHeight <= window.innerHeight'),true);
      const visible = await evaluate(`(() => {const selectors=['#game','.dashboard','.controls','#angle','#canister-frequency','#canister-volume','#lift-power','#reset-parameters','#action'];return selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});})()`);
      for (const element of visible) assert.ok(element.x>=0&&element.y>=0&&element.right<=width+.5&&element.bottom<=height+.5,JSON.stringify(element));
      assert.equal(visible[0].x,0); assert.equal(visible[0].y,0); assert.equal(visible[0].right,width); assert.equal(visible[0].bottom,height);
      await evaluate('flightGame.scene.getScene("Flight").resetRun()');
      await screenshot(`layout-${width}.png`);
      await evaluate('(() => {const s=flightGame.scene.getScene("Flight");s.model.phase="landed";s.land();})()');
      const resultBounds=await evaluate('(() => {const result=document.getElementById("result").getBoundingClientRect();return {top:result.top,bottom:result.bottom,hudBottom:document.querySelector(".dashboard").getBoundingClientRect().bottom,controlsTop:document.querySelector(".controls").getBoundingClientRect().top};})()');
      assert.ok(resultBounds.top>=resultBounds.hudBottom&&resultBounds.bottom<=resultBounds.controlsTop,JSON.stringify({width,height,...resultBounds}));
      if(width===320) await screenshot('result-mobile.png');
      await evaluate('flightGame.scene.getScene("Flight").resetRun()');
    }
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(200); await screenshot('mobile.png');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
    // Настоящий touchstart/touchend: запуск и удержание через экран.
    const touchPos=await box('#game');
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPos,id:1}]}); await sleep(250);
    assert.equal((await state()).phase,'flying'); assert.ok((await state()).fuel<99);
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await click('#reset');
    // Частота действительно меняет число предметов; монеты остаются на месте.
    const coinCount=await evaluate('flightGame.scene.getScene("Flight").pickups.getChildren().filter(o=>o.kind==="coin").length');
    await setSlider('canister-frequency',0);
    assert.equal(await evaluate('flightGame.scene.getScene("Flight").pickups.getChildren().filter(o=>o.kind==="fuel").length'),0);
    assert.equal(await evaluate('flightGame.scene.getScene("Flight").pickups.getChildren().filter(o=>o.kind==="coin").length'),coinCount);
    await setSlider('canister-frequency',6);
    const dense=await evaluate('(() => {const s=flightGame.scene.getScene("Flight");return s.pickups.getChildren().filter(o=>o.kind==="fuel"&&o.x<=s.model.x+1000+1e-7).map(o=>o.x-s.model.x);})()');
    assert.equal(dense.length,6);
    dense.forEach((x,i)=>assert.ok(Math.abs(x-(i+1)*1000/6)<1e-7));
    await setSlider('canister-volume',55); await setSlider('lift-power',150); await setSlider('angle',46);
    await click('#action');
    await evaluate('(() => {const s=flightGame.scene.getScene("Flight");s.model.fuel=10;s.addPickup(s.model.x,s.model.y,"fuel");})()');
    await sleep(150);
    assert.equal((await state()).fuel,65);
    assert.equal(await evaluate('flightGame.scene.getScene("Flight").model.liftForce'),990);
    await setSlider('canister-frequency',4.5);
    assert.equal((await state()).phase,'flying');
    await command('Page.navigate',{url:`http://127.0.0.1:${port}/`});
    for(let i=0;i<100;i++){try{if((await state()).phase==='ready')break;}catch{}await sleep(50);}
    const saved = await evaluate('(() => {const ids=["angle","canister-frequency","canister-volume","lift-power"];return ids.map(id=>Number(document.getElementById(id).value));})()');
    assert.deepEqual(saved,[46,4.5,55,150]);
    assert.equal((await state()).angle,46);
    assert.equal(await evaluate('flightGame.scene.getScene("Flight").model.liftForce'),990);
    // Cookie остаётся доступен при смене порта после нового запуска сервера.
    const otherPortCookies=await command('Network.getCookies',{urls:[`http://127.0.0.1:${Number(port)===65535?65534:Number(port)+1}/`]});
    assert.ok(otherPortCookies.cookies.some(cookie=>cookie.name==='airplane-parameters-v1'&&JSON.parse(decodeURIComponent(cookie.value)).canisterVolume===55));
    await click('#action'); const beforeDefaults=await state();
    await click('#reset-parameters');
    assert.equal((await state()).phase,'flying');
    assert.ok((await state()).distance>=beforeDefaults.distance);
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".parameter input")).map(input=>Number(input.value))'),[40,2,30,100]);
    assert.equal(await evaluate('flightGame.scene.getScene("Flight").model.liftForce'),660);
    await click('#reset'); assert.equal((await state()).angle,40);
    await screenshot('mobile.png');
    assert.deepEqual(errors,[]); assert.deepEqual(failed,[]);
    console.log('PASS: flight, collection, angle, markers, coin shapes, fullscreen without scroll, stable HUD, mobile/touch, live parameters, canister density/volume, adjustable lift, saved settings/reload/port scope, parameter reset');
    console.log('Screenshots: .checks/desktop.png, flying.png, result.png, mobile.png');
  } finally {
    try { if(command) await command('Browser.close'); } catch {}
    ws?.close(); edge.kill();
  }
})().catch(error => { console.error(error); console.error('Page errors:',JSON.stringify(errors)); process.exitCode=1; });
