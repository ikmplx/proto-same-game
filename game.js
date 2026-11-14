/* Phaser отвечает за картинку и ввод, FlightModel — за реальные правила полёта. */
(() => {
  'use strict';
  if (typeof Phaser === 'undefined') { window.showGameError(); return; }
  const ui = Object.fromEntries(['distance', 'coins', 'fuel-value', 'fuel-fill', 'fuel-note',
    'phase-label', 'phase-dot', 'intro', 'flight-tip', 'result', 'result-distance', 'result-coins',
    'result-message', 'angle', 'angle-value', 'angle-control', 'control-help', 'action']
    .map(id => [id, document.getElementById(id)]));
  const heldPointers = new Set();
  let spaceHeld = false;
  let scene;
  const isHeld = () => heldPointers.size > 0 || spaceHeld;
  function clearInput() { heldPointers.clear(); spaceHeld = false; ui.action.classList.remove('held'); }
  function beginInput(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!scene || document.hidden) return;
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
    if (event.detail !== 0 || !scene) return;
    if (scene.model.phase === 'ready') scene.launch();
    else if (scene.model.phase === 'landed') scene.resetRun();
  });
  window.addEventListener('pointerup', releaseInput);
  window.addEventListener('pointercancel', releaseInput);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { clearInput(); if (scene) scene.accumulator = 0; });
  window.addEventListener('keydown', event => {
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
      ui.angle.value = Math.max(15, Math.min(75, Number(ui.angle.value) + (['ArrowRight', 'ArrowUp'].includes(event.code) ? 1 : -1)));
      scene.adjustAngle();
    }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') spaceHeld = false; });
  ui.angle.addEventListener('input', () => scene?.adjustAngle());
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
      this.add.circle(1000, 113, 53, 0xfaf0c9, .65).setScrollFactor(0).setDepth(-20);
      this.clouds = [];
      for (let i = 0; i < 8; i++) {
        const cloud = this.add.image(120 + i * 210, 70 + (i * 79 % 190), 'cloud')
          .setScale(.45 + (i % 3) * .18).setAlpha(.65).setScrollFactor(0).setDepth(-18);
        cloud.baseX = cloud.x; cloud.baseY = cloud.y; this.clouds.push(cloud);
      }
      this.hills = [0, 1, 2].map(i => this.add.image(i * 1200, 180, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-15));
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
    }
    resetRun() {
      clearInput();
      this.model = new FlightModel(Number(ui.angle.value));
      this.accumulator = 0; this.trailPoints = []; this.trailClock = 0; this.nextSegment = 0;
      this.pickups.clear(true, true); this.decorations.clear(true, true); this.effects.clear(true, true);
      this.cameras.main.setScroll(0, 0);
      this.plane.setAlpha(1); this.propeller.setVisible(false); this.planeShadow.setVisible(true);
      for (const [x, y, scale] of [[40, 521, .55], [340, 523, .36], [1015, 527, .75], [1080, 527, .55]]) {
        this.decorations.add(this.add.image(x, y, 'tree').setOrigin(.5, 1).setScale(scale).setDepth(2));
      }
      this.addSign(85, 'СТАРТ');
      this.populate(2200);
      ui.intro.hidden = false; ui.result.hidden = true; ui['flight-tip'].hidden = true;
      ui.angle.disabled = false; ui['angle-control'].classList.remove('disabled');
      ui.action.disabled = false; ui.action.innerHTML = 'Запуск <span>↗</span>';
      ui['control-help'].innerHTML = '<strong>Сначала — хороший разгон</strong><span>Измени угол ползунком или клавишами ← →</span>';
      this.syncView(); this.updateHud();
    }
    adjustAngle() {
      if (this.model.phase !== 'ready') return;
      this.model.reset(Number(ui.angle.value));
      ui['angle-value'].textContent = `${this.model.angle}°`;
      this.syncView();
    }
    launch() {
      if (this.model.phase !== 'ready') return;
      this.model.launch();
      ui.intro.hidden = true; ui['flight-tip'].hidden = false;
      ui.angle.disabled = true; ui['angle-control'].classList.add('disabled');
      ui.action.innerHTML = 'Удерживай: подъём <span>↑</span>';
      ui['control-help'].innerHTML = '<strong>Отпускай, чтобы планировать</strong><span>Без нажатия топливо сохраняется. Канистра даёт +30%.</span>';
      this.aim.clear();
    }
    addSign(x, text) {
      const post = this.add.rectangle(x, 516, 4, 32, 0x947a56).setDepth(4);
      const board = this.add.rectangle(x, 497, 65, 23, 0xe9dfb7).setStrokeStyle(1, 0xa4966d).setDepth(4);
      const label = this.add.text(x, 497, text, { fontFamily: 'Arial', fontSize: '9px', color: '#6f795d', fontStyle: 'bold' }).setOrigin(.5).setDepth(5);
      this.decorations.addMultiple([post, board, label]);
    }
    populate(untilX) {
      while (this.nextSegment * 620 < untilX) {
        const index = this.nextSegment++;
        const base = 480 + index * 620;
        const centerY = 325 + Math.sin(index * 1.9) * 100;
        for (let i = 0; i < 6; i++) this.addPickup(base + i * 46, centerY - Math.sin(i / 5 * Math.PI) * 65, 'coin');
        this.addPickup(base + 370, centerY + 5, 'fuel');
        // Второй маршрут над землёй: рискованный подъём тоже приносит награду.
        if (index > 0) {
          for (let i = 0; i < 5; i++) this.addPickup(base + i * 49, -160 - (index % 3) * 180 - Math.sin(i) * 40, 'coin');
          if (index % 2 === 0) this.addPickup(base + 310, -280 - (index % 3) * 180, 'fuel');
        }
        if (index > 2 && index % 3 === 0) this.addPickup(base + 160, -1100, 'fuel');
        if (index > 1) {
          this.addSign(index * 620, `${Math.round((index * 620 - 210) / 10)} м`);
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
      const label = this.add.text(obj.x, obj.y - 22, obj.kind === 'coin' ? '+1' : '+30% топлива', {
        fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: obj.kind === 'coin' ? '#ab7c23' : '#407d60',
        stroke: '#fcfcf1', strokeThickness: 4
      }).setOrigin(.5).setDepth(12);
      this.effects.add(label);
      this.tweens.add({ targets: label, y: label.y - 45, alpha: 0, duration: 800, onComplete: () => label.destroy() });
      obj.destroy();
    }
    land() {
      clearInput(); this.propeller.setVisible(false);
      ui['flight-tip'].hidden = true; ui.result.hidden = false;
      ui['result-distance'].textContent = this.model.distance;
      ui['result-coins'].textContent = this.model.coins;
      ui['result-message'].textContent = this.model.fuel < 1 ? 'Топливо закончилось. Попробуй короткие включения подъёма.' : 'Попробуй другой угол и чередуй подъём с падением.';
      ui.action.innerHTML = 'Новая попытка <span>↗</span>';
      ui['control-help'].innerHTML = '<strong>Каждый запуск — новый эксперимент</strong><span>Нажми «Новая попытка» или клавишу R.</span>';
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
      if (m.phase === 'flying') {
        ui['flight-tip'].textContent = m.fuel <= 0 ? 'Топливо закончилось · канистра даёт +30%' : m.lifting ? 'Подъём включён · отпусти, чтобы сберечь топливо' : 'Удерживай экран, кнопку или пробел для подъёма';
      }
    }
    syncView() {
      const m = this.model, camera = this.cameras.main;
      camera.scrollX = Math.max(0, m.x - 310);
      camera.scrollY = Math.min(0, m.y - 200);
      this.hills.forEach((hill, i) => {
        hill.x = i * 1200 - (camera.scrollX * .22 % 1200);
        hill.y = 180 - camera.scrollY * .5;
        hill.alpha = Math.max(0, 1 + camera.scrollY / 1800);
      });
      this.ground.tilePositionX = camera.scrollX;
      this.ground.y = 486 - camera.scrollY;
      this.clouds.forEach((cloud, i) => {
        cloud.x = Phaser.Math.Wrap(cloud.baseX - camera.scrollX * .13 - this.time.now * .002 * (i % 2 + 1), -150, 1500);
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
      if (!this.model || document.hidden) return;
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
        this.populate(m.x + 1800);
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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: FlightScene
  });
  window.flightGame = game;
})();
