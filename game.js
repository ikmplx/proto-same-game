/* Phaser отвечает за картинку и ввод, FlightModel — за реальные правила полёта. */
(() => {
  'use strict';
  if (typeof Phaser === 'undefined') { window.showGameError(); return; }
  const ui = Object.fromEntries(['distance', 'coins', 'fuel-value', 'fuel-fill', 'fuel-note',
    'phase-label', 'phase-dot', 'intro', 'result', 'result-distance', 'result-coins',
    'result-message', 'angle', 'angle-value', 'angle-control', 'action', 'canister-frequency',
    'canister-frequency-value', 'canister-volume', 'canister-volume-value', 'lift-power', 'lift-power-value', 'settings-note']
    .map(id => [id, document.getElementById(id)]));
  const parameterCookie = 'airplane-parameters-v1';
  function loadParameters() {
    try {
      const saved = document.cookie.split('; ').find(value => value.startsWith(`${parameterCookie}=`));
      return normalizeFlightParameters(saved ? JSON.parse(decodeURIComponent(saved.slice(parameterCookie.length + 1))) : {});
    } catch { return normalizeFlightParameters(); }
  }
  // Cookie хранится в браузере и действует для всех портов локального сервера.
  let parameters = loadParameters();
  function saveParameters() {
    try {
      const encoded = encodeURIComponent(JSON.stringify(parameters));
      document.cookie = `${parameterCookie}=${encoded}; Path=/; Max-Age=31536000; SameSite=Strict`;
      const saved = document.cookie.split('; ').find(value => value.startsWith(`${parameterCookie}=`));
      ui['settings-note'].textContent = saved?.slice(parameterCookie.length + 1) === encoded ? 'Параметры сохранены в браузере' : 'Браузер запретил сохранение параметров';
    } catch { ui['settings-note'].textContent = 'Браузер запретил сохранение параметров'; }
  }
  function syncParameters() {
    ui.angle.value = parameters.angle;
    ui['angle-value'].textContent = `${parameters.angle}°`;
    ui['canister-frequency'].value = parameters.canisterFrequency;
    ui['canister-frequency-value'].textContent = parameters.canisterFrequency ? `${parameters.canisterFrequency} / 100 м` : 'Нет';
    ui['canister-volume'].value = parameters.canisterVolume;
    ui['canister-volume-value'].textContent = `${parameters.canisterVolume}%`;
    ui['lift-power'].value = parameters.liftPercent;
    ui['lift-power-value'].textContent = `${parameters.liftPercent}%`;
  }
  syncParameters();
  const heldPointers = new Set();
  const settingsDialog = document.getElementById('settings-dialog');
  let spaceHeld = false;
  let scene;
  const isHeld = () => heldPointers.size > 0 || spaceHeld;
  function clearInput() { heldPointers.clear(); spaceHeld = false; ui.action.classList.remove('held'); }
  document.getElementById('open-settings').addEventListener('click', () => {
    clearInput();
    if (scene) scene.accumulator = 0;
    document.getElementById('settings-done').textContent = scene?.model.phase === 'flying' ? 'Продолжить' : 'Готово';
    settingsDialog.showModal();
  });
  for (const id of ['close-settings', 'settings-done']) document.getElementById(id).addEventListener('click', () => settingsDialog.close());
  settingsDialog.addEventListener('close', () => { clearInput(); if (scene) scene.accumulator = 0; });
  settingsDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const elements = Array.from(settingsDialog.querySelectorAll('button:not(:disabled), input:not(:disabled)'));
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  settingsDialog.addEventListener('click', event => {
    if (event.target !== settingsDialog) return;
    const bounds = settingsDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) settingsDialog.close();
  });
  function beginInput(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!scene || document.hidden || settingsDialog.open) return;
    event.preventDefault();
    if (scene.model.phase === 'landed') { scene.resetRun(); return; }
    heldPointers.add(event.pointerId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (scene.model.phase === 'ready') scene.launch();
  }
  function releaseInput(event) { heldPointers.delete(event.pointerId); }
  document.getElementById('game').addEventListener('pointerdown', beginInput);
  ui.action.addEventListener('pointerdown', beginInput);
  // Click сохраняет работу кнопки с клавиатуры и вспомогательных устройств.
  ui.action.addEventListener('click', event => {
    if (event.detail !== 0 || !scene || settingsDialog.open) return;
    if (scene.model.phase === 'ready') scene.launch();
    else if (scene.model.phase === 'landed') scene.resetRun();
  });
  window.addEventListener('pointerup', releaseInput);
  window.addEventListener('pointercancel', releaseInput);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { clearInput(); if (scene) scene.accumulator = 0; });
  window.addEventListener('keydown', event => {
    if (settingsDialog.open) return;
    const formTarget = /INPUT|BUTTON/.test(event.target.tagName);
    if (event.code === 'Space' && (!formTarget || event.target === ui.action)) {
      event.preventDefault();
      if (!event.repeat && scene) {
        spaceHeld = true;
        if (scene.model.phase === 'ready') scene.launch();
        else if (scene.model.phase === 'landed') scene.resetRun();
      }
    }
    if (event.code === 'KeyR' && !event.repeat) scene?.resetRun();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code) && !formTarget && scene?.model.phase === 'ready') {
      event.preventDefault();
      ui.angle.value = Math.max(FlightRules.minAngle, Math.min(FlightRules.maxAngle, Number(ui.angle.value) + (['ArrowRight', 'ArrowUp'].includes(event.code) ? 1 : -1)));
      scene.adjustAngle();
    }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });
  ui.angle.addEventListener('input', () => scene?.adjustAngle());
  for (const [id, key] of [['canister-frequency', 'canisterFrequency'], ['canister-volume', 'canisterVolume'], ['lift-power', 'liftPercent']]) {
    ui[id].addEventListener('input', () => {
      parameters = normalizeFlightParameters({ ...parameters, [key]: Number(ui[id].value) });
      syncParameters(); saveParameters();
      scene?.model.setParameters(parameters);
      if (key === 'canisterFrequency') scene?.resetCanisters();
    });
  }
  document.getElementById('reset-parameters').addEventListener('click', () => {
    parameters = normalizeFlightParameters();
    syncParameters(); saveParameters();
    if (scene) {
      scene.model.setParameters(parameters);
      if (scene.model.phase === 'ready') scene.adjustAngle();
      scene.resetCanisters();
    }
  });
  document.getElementById('reset').addEventListener('click', () => scene?.resetRun());
  document.getElementById('again').addEventListener('click', () => scene?.resetRun());

  class FlightScene extends Phaser.Scene {
    constructor() { super('Flight'); }
    preload() {
      for (const name of ['plane', 'coin', 'fuel', 'launcher', 'hills', 'ground', 'cloud', 'tree']) {
        this.load.svg(name, `assets/${name}.svg`);
      }
      this.load.on('loaderror', () => window.showGameError());
    }
    create() {
      scene = this;
      this.cameras.main.setBackgroundColor('#dcebe6');
      this.sun = this.add.circle(1000, 113, 53, 0xfaf0c9, .65).setScrollFactor(0).setDepth(-20);
      this.clouds = [];
      for (let i = 0; i < 8; i++) {
        const cloud = this.add.image(120 + i * 210, 70 + (i * 79 % 190), 'cloud')
          .setScale(.45 + (i % 3) * .18).setAlpha(.65).setScrollFactor(0).setDepth(-18);
        cloud.baseX = cloud.x; cloud.baseY = cloud.y; this.clouds.push(cloud);
      }
      this.hills = [0, 1, 2].map(i => this.add.image(i * 1200, 180, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-15));
      this.earth = this.add.rectangle(0, 600, 1200, 800, 0xd0c49a).setOrigin(0).setScrollFactor(0).setDepth(2);
      this.ground = this.add.tileSprite(0, 486, 1200, 130, 'ground').setOrigin(0).setScrollFactor(0).setDepth(3);
      this.decorations = this.add.group();
      this.pickups = this.add.group();
      this.effects = this.add.group();
      this.launcher = this.add.image(155, 481, 'launcher').setDisplaySize(103, 120).setDepth(4);
      this.rail = this.add.rectangle(155, 465, 100, 14, 0x80674c).setOrigin(.15, .5).setDepth(5);
      this.railHighlight = this.add.rectangle(155, 461, 100, 3, 0xc6ac7e).setOrigin(.15, .5).setDepth(5);
      this.aim = this.add.graphics().setDepth(6);
      this.planeShadow = this.add.ellipse(205, 528, 70, 10, 0x536b52, .2).setDepth(4);
      this.plane = this.add.image(0, 0, 'plane').setDisplaySize(115, 64).setDepth(10);
      this.propeller = this.add.ellipse(0, 0, 4, 33, 0xe8eadd, .65).setDepth(11);
      this.trail = this.add.graphics().setDepth(7);
      this.resetRun();
      this.scale.on('resize', this.resizeView, this);
      this.layoutObserver = new ResizeObserver(() => this.resizeView());
      this.layoutObserver.observe(document.querySelector('.dashboard'));
      this.resizeView();
    }
    resizeView() {
      const hudHeight = document.querySelector('.dashboard').getBoundingClientRect().height;
      const actionTop = ui.action.getBoundingClientRect().top;
      document.querySelector('.arena').style.setProperty('--play-center', `${(hudHeight + actionTop) / 2}px`);
      this.cameras.main.setOrigin(0, 0).setZoom(Math.max(.25, this.scale.height / 580));
      this.viewWidth = this.scale.width / this.cameras.main.zoom;
      this.followY = Math.max(200, (hudHeight + 45) / this.cameras.main.zoom);
      while (this.hills.length < Math.ceil(this.viewWidth / 1200) + 1) {
        this.hills.push(this.add.image(0, 180, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-15));
      }
      this.ground.width = this.viewWidth + 1;
      this.earth.width = this.viewWidth + 1;
      this.sun.x = this.viewWidth * .83;
      if (this.model) { this.populate(this.model.x + this.viewWidth + 1000); this.syncView(); }
    }
    resetRun() {
      clearInput();
      this.model = new FlightModel(Number(ui.angle.value), parameters);
      this.accumulator = 0; this.trailPoints = []; this.trailClock = 0; this.nextSegment = 0; this.nextMarker = 50;
      this.canisterIndex = 0;
      this.nextCanisterX = this.model.startX + this.canisterSpacing;
      this.pickups.clear(true, true); this.decorations.clear(true, true); this.effects.clear(true, true);
      this.cameras.main.setScroll(0, 0);
      this.plane.setAlpha(1); this.propeller.setVisible(false); this.planeShadow.setVisible(true);
      for (const [x, y, scale] of [[40, 521, .55], [340, 523, .36], [1015, 527, .75], [1080, 527, .55]]) {
        this.decorations.add(this.add.image(x, y, 'tree').setOrigin(.5, 1).setScale(scale).setDepth(2));
      }
      this.addSign(85, 'СТАРТ');
      this.populate(this.model.x + Math.max(2000, (this.viewWidth || 1200) + 1000));
      ui.intro.hidden = false; ui.result.hidden = true;
      ui.angle.disabled = false; ui['angle-control'].classList.remove('disabled');
      ui.action.disabled = false; ui.action.innerHTML = 'Запуск <span>↗</span>';
      this.syncView(); this.updateHud();
    }
    adjustAngle() {
      if (this.model.phase !== 'ready') return;
      this.model.reset(Number(ui.angle.value));
      parameters.angle = this.model.angle;
      saveParameters();
      for (const obj of this.decorations.getChildren()) {
        if (obj.markerDistance != null) obj.x = this.model.startX + obj.markerDistance * FlightRules.pixelsPerMeter;
      }
      this.resetCanisters();
      ui['angle-value'].textContent = `${this.model.angle}°`;
      this.syncView();
    }
    launch() {
      if (this.model.phase !== 'ready') return;
      this.model.launch();
      ui.intro.hidden = true;
      ui.angle.disabled = true; ui['angle-control'].classList.add('disabled');
      ui.action.innerHTML = 'Удерживай: подъём <span>↑</span>';
      this.aim.clear();
    }
    addSign(x, text, markerDistance = null) {
      const post = this.add.rectangle(x, 516, 4, 32, 0x947a56).setDepth(4);
      const board = this.add.rectangle(x, 497, 65, 23, 0xe9dfb7).setStrokeStyle(1, 0xa4966d).setDepth(4);
      const label = this.add.text(x, 497, text, { fontFamily: 'Arial', fontSize: '9px', color: '#6f795d', fontStyle: 'bold' }).setOrigin(.5).setDepth(5);
      this.decorations.addMultiple([post, board, label]);
      for (const obj of [post, board, label]) obj.markerDistance = markerDistance;
    }
    addCoinPattern(x, y, index) {
      // Формы чередуются предсказуемо, чтобы попытки можно было сравнивать.
      const patterns = [
        [[0, 0], [46, -38], [92, -62], [138, -62], [184, -38], [230, 0]], // дуга
        [[0, 0], [46, 0], [92, 0], [138, 0], [184, 0], [230, 0]], // ряд
        [[0, 25], [46, -25], [92, 25], [138, -25], [184, 25], [230, -25]], // зигзаг
        [[0, 0], [46, -40], [92, -80], [138, -40], [184, 0], [138, 40], [92, 80], [46, 40]], // ромб
        [[0, -40], [0, 0], [0, 40], [46, -40], [46, 0], [46, 40], [92, -40], [92, 0], [92, 40]] // кластер
      ];
      for (const [dx, dy] of patterns[index % patterns.length]) this.addPickup(x + dx, y + dy, 'coin');
    }
    get canisterSpacing() {
      return parameters.canisterFrequency > 0 ? 100 * FlightRules.pixelsPerMeter / parameters.canisterFrequency : Infinity;
    }
    resetCanisters() {
      for (const obj of this.pickups.getChildren().slice()) if (obj.kind === 'fuel') obj.destroy();
      this.canisterIndex = 0;
      this.nextCanisterX = this.model.x + this.canisterSpacing;
      this.populate(this.model.x + (this.viewWidth || 1200) + 1000);
    }
    populate(untilX) {
      while (this.nextCanisterX < untilX) {
        const heights = [325, 240, 390, -220, 300, -500];
        this.addPickup(this.nextCanisterX, heights[this.canisterIndex++ % heights.length], 'fuel');
        this.nextCanisterX += this.canisterSpacing;
      }
      while (this.model.startX + this.nextMarker * FlightRules.pixelsPerMeter < untilX) {
        this.addSign(this.model.startX + this.nextMarker * FlightRules.pixelsPerMeter, `${this.nextMarker} м`, this.nextMarker);
        this.nextMarker += 50;
      }
      while (this.nextSegment * 620 < untilX) {
        const index = this.nextSegment++;
        const base = 480 + index * 620;
        const centerY = 325 + Math.sin(index * 1.9) * 100;
        this.addCoinPattern(base, centerY, index);
        // Второй маршрут над землёй: рискованный подъём тоже приносит награду.
        if (index > 0) {
          this.addCoinPattern(base, -160 - (index % 3) * 180, index + 2);
        }
        if (index > 1) {
          const tree = this.add.image(base + 280, 528, 'tree').setOrigin(.5, 1).setScale(.4 + (index % 4) * .15).setDepth(2);
          this.decorations.add(tree);
        }
      }
    }
    addPickup(x, y, kind) {
      const obj = this.add.image(x, y, kind).setDisplaySize(kind === 'coin' ? 30 : 33, kind === 'coin' ? 30 : 39).setDepth(8);
      obj.kind = kind; obj.baseY = y; obj.phase = x * .02;
      this.pickups.add(obj);
    }
    collect(obj) {
      if (obj.kind === 'coin') this.model.coins++;
      else this.model.addFuel();
      const label = this.add.text(obj.x, obj.y - 22, obj.kind === 'coin' ? '+1' : `+${this.model.parameters.canisterVolume}% топлива`, {
        fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: obj.kind === 'coin' ? '#ab7c23' : '#407d60',
        stroke: '#fcfcf1', strokeThickness: 4
      }).setOrigin(.5).setDepth(12);
      this.effects.add(label);
      this.tweens.add({ targets: label, y: label.y - 45, alpha: 0, duration: 800, onComplete: () => label.destroy() });
      obj.destroy();
    }
    land() {
      clearInput(); this.propeller.setVisible(false);
      ui.result.hidden = false;
      ui['result-distance'].textContent = this.model.distance;
      ui['result-coins'].textContent = this.model.coins;
      ui['result-message'].textContent = this.model.fuel < 1 ? 'Топливо закончилось. Попробуй короткие включения подъёма.' : 'Попробуй другой угол и чередуй подъём с падением.';
      ui.action.innerHTML = 'Новая попытка <span>↗</span>';
    }
    updateHud() {
      const m = this.model;
      ui.distance.textContent = m.distance;
      ui.coins.textContent = m.coins;
      ui['fuel-value'].textContent = `${Math.ceil(m.fuel)}%`;
      ui['fuel-fill'].style.width = `${m.fuel}%`;
      ui['fuel-fill'].style.background = m.fuel < 25 ? '#d57a50' : '#7ba28b';
      document.querySelector('.fuel-track').setAttribute('aria-valuenow', Math.ceil(m.fuel));
      ui['fuel-note'].textContent = m.fuel <= 0 ? 'Пусто — ищи зелёную канистру' : m.lifting ? 'Подъём включён · −18% / сек' : 'Расходуется только при подъёме';
      ui['phase-label'].textContent = { ready: 'ГОТОВ К ВЗЛЁТУ', flying: m.lifting ? 'НАБИРАЕМ ВЫСОТУ' : 'СВОБОДНЫЙ ПОЛЁТ', landed: 'ПОЛЁТ ЗАВЕРШЁН' }[m.phase];
      ui['phase-dot'].style.background = m.lifting ? '#d56c42' : '#6f9680';
      ui.action.classList.toggle('held', m.lifting);
    }
    syncView() {
      const m = this.model, camera = this.cameras.main;
      const viewWidth = this.viewWidth || 1200;
      camera.scrollX = Math.max(0, m.x - Math.min(310, viewWidth * .32));
      camera.scrollY = Math.min(0, m.y - (this.followY || 200));
      this.hills.forEach((hill, i) => {
        hill.x = i * 1200 - (camera.scrollX * .22 % 1200);
        hill.y = 180 - camera.scrollY * .5;
        hill.alpha = Math.max(0, 1 + camera.scrollY / 1800);
      });
      this.ground.tilePositionX = camera.scrollX;
      this.ground.y = 486 - camera.scrollY;
      this.earth.y = 600 - camera.scrollY;
      this.earth.height = Math.max(0, this.scale.height / camera.zoom - this.earth.y);
      this.clouds.forEach((cloud, i) => {
        cloud.x = Phaser.Math.Wrap(cloud.baseX - camera.scrollX * .13 - this.time.now * .002 * (i % 2 + 1), -150, viewWidth + 150);
        cloud.y = Phaser.Math.Wrap(cloud.baseY - camera.scrollY * .13, -70, 530);
      });
      this.plane.setPosition(m.x, m.y);
      const targetAngle = m.phase === 'ready' ? -m.angle : m.phase === 'landed' ? 8 : Phaser.Math.RadToDeg(Math.atan2(m.vy, m.vx)) * .65;
      this.plane.setAngle(targetAngle);
      const rad = Phaser.Math.DegToRad(targetAngle);
      this.propeller.setPosition(m.x + Math.cos(rad) * 45, m.y + Math.sin(rad) * 45).setAngle(targetAngle);
      this.propeller.setVisible(m.phase === 'flying' && m.lifting).setScale(1, .65 + Math.abs(Math.sin(this.time.now * .09)) * .6);
      this.planeShadow.setPosition(m.x, 529).setScale(Math.max(.25, 1 - (518 - m.y) / 1000)).setAlpha(Math.max(.02, .2 - (518 - m.y) / 3000));
      this.rail.setAngle(-m.angle); this.railHighlight.setAngle(-m.angle);
      this.aim.clear();
      if (m.phase === 'ready') {
        // Резинка соединяет самолёт с катапультой, точки показывают первые мгновения полёта.
        this.aim.lineStyle(3, 0x70513e, .8).beginPath().moveTo(135, 466).lineTo(m.x - 30, m.y + 14).lineTo(165, 472).strokePath();
        const velocity = m.launchVelocity;
        for (let i = 1; i <= 12; i++) {
          const t = i * .068;
          this.aim.fillStyle(0x688e82, .65 - i * .035).fillCircle(m.x + velocity.vx * t,
            m.y + velocity.vy * t + FlightRules.gravity * t * t / 2, 2.5);
        }
      }
      this.trail.clear();
      this.trailPoints.forEach((point, i) => {
        this.trail.fillStyle(point.lift ? 0xeee0b8 : 0xffffff, i / this.trailPoints.length * .4).fillCircle(point.x, point.y, point.lift ? 4 : 2);
      });
    }
    update(time, delta) {
      if (!this.model || document.hidden || settingsDialog.open) return;
      const m = this.model;
      if (m.phase === 'flying') {
        this.accumulator += Math.min(delta / 1000, .1);
        const step = 1 / 120;
        while (this.accumulator >= step && m.phase === 'flying') {
          const oldX = m.x, oldY = m.y;
          m.advance(step, isHeld());
          for (const obj of this.pickups.getChildren().slice()) {
            if (flightHitsSegment(obj.x, obj.y, oldX, oldY, m.x, m.y, obj.kind === 'coin' ? 36 : 39)) this.collect(obj);
          }
          this.accumulator -= step;
        }
        this.populate(m.x + Math.max(1800, (this.viewWidth || 1200) + 500));
        this.trailClock += delta;
        if (this.trailClock > 45) {
          this.trailClock = 0; this.trailPoints.push({ x: m.x - 35, y: m.y + 8, lift: m.lifting });
          if (this.trailPoints.length > 28) this.trailPoints.shift();
        }
        for (const group of [this.pickups, this.decorations]) {
          for (const obj of group.getChildren().slice()) if (obj.x < this.cameras.main.scrollX - 180) obj.destroy();
        }
        if (m.phase === 'landed') this.land();
      }
      for (const obj of this.pickups.getChildren()) {
        // Колеблется только масштаб — место реального сбора остаётся неизменным.
        if (obj.kind === 'coin') obj.scaleX = (30 / 50) * (.85 + Math.sin(time * .003 + obj.phase) * .15);
      }
      this.syncView(); this.updateHud();
    }
  }
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: 1200, height: 580,
    backgroundColor: '#dcebe6', render: { antialias: true },
    loader: { imageLoadType: 'HTMLImageElement' },
    scale: { mode: Phaser.Scale.RESIZE },
    scene: FlightScene
  });
  window.flightGame = game;
})();
