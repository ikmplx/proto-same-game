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
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    let initial;
    for (let i=0;i<100;i++) { try { initial=await state(); if(initial.phase==='ready') break; } catch {} await sleep(100); }
    assert.equal(initial?.phase,'ready'); assert.equal(initial.error,false); assert.ok(initial.pickups>20);
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
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(200); await screenshot('mobile.png');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true);
    // Настоящий touchstart/touchend: запуск и удержание через экран.
    const touchPos=await box('#game');
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPos,id:1}]}); await sleep(250);
    assert.equal((await state()).phase,'flying'); assert.ok((await state()).fuel<99);
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await click('#reset');
    assert.deepEqual(errors,[]); assert.deepEqual(failed,[]);
    console.log('PASS: local assets, JS errors, angle, mouse launch/hold/release, scrolling, landing, results, reset, coins, fuel pickup, empty/refilled tank, keyboard, mobile layout, touch');
    console.log('Screenshots: .checks/desktop.png, flying.png, result.png, mobile.png');
  } finally {
    try { if(command) await command('Browser.close'); } catch {}
    ws?.close(); edge.kill();
  }
})().catch(error => { console.error(error); console.error('Page errors:',JSON.stringify(errors)); process.exitCode=1; });
