/* Правила эксперимента: 10 пикселей = 1 метр; топливо тратится только на подъём.
   Горизонтальная скорость одинакова при любом угле. Угол задаёт вертикальную скорость.
   Без нажатия действуют постоянная гравитация и начальная скорость запуска.
   Канистра возвращает 30% топлива (до 100%), касание земли завершает попытку. */
(function (root) {
  'use strict';
  const RULES = Object.freeze({ gravity: 280, lift: 550, horizontalSpeed: 480,
    fuelRate: 18, fuelPickup: 30, ground: 518, pixelsPerMeter: 10 });
  class FlightModel {
    constructor(angle = 40) { this.reset(angle); }
    reset(angle = 40) {
      this.angle = Math.max(15, Math.min(75, angle));
      const rad = this.angle * Math.PI / 180;
      this.x = 155 + Math.cos(rad) * 72;
      this.y = 465 - Math.sin(rad) * 72;
      this.startX = this.x;
      this.vx = 0; this.vy = 0; this.fuel = 100; this.coins = 0;
      this.phase = 'ready'; this.lifting = false; this.elapsed = 0;
    }
    get launchVelocity() {
      const rad = this.angle * Math.PI / 180;
      return { vx: RULES.horizontalSpeed, vy: -RULES.horizontalSpeed * Math.tan(rad) };
    }
    launch() {
      if (this.phase !== 'ready') return;
      const velocity = this.launchVelocity;
      this.vx = velocity.vx;
      this.vy = velocity.vy;
      this.phase = 'flying';
    }
    advance(dt, pressed) {
      if (this.phase !== 'flying' || dt <= 0) return;
      const burnTime = pressed ? Math.min(dt, this.fuel / RULES.fuelRate) : 0;
      this.lifting = burnTime > 0;
      // Делим шаг при исчерпании топлива: последняя порция даёт ровно свою силу.
      for (const [time, acceleration] of [[burnTime, RULES.gravity - RULES.lift],
        [dt - burnTime, RULES.gravity]]) {
        if (time <= 0) continue;
        this.x += this.vx * time;
        this.y += this.vy * time + acceleration * time * time / 2;
        this.vy += acceleration * time;
      }
      this.elapsed += dt;
      this.fuel = Math.max(0, this.fuel - burnTime * RULES.fuelRate);
      if (this.y >= RULES.ground) {
        this.y = RULES.ground; this.phase = 'landed'; this.lifting = false;
      }
    }
    addFuel() { this.fuel = Math.min(100, this.fuel + RULES.fuelPickup); }
    get distance() { return Math.max(0, Math.floor((this.x - this.startX) / RULES.pixelsPerMeter)); }
  }
  // Непрерывная проверка сбора: бонус не пропускается между кадрами.
  function hitsSegment(x, y, ax, ay, bx, by, radius) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= radius ** 2;
  }
  root.FlightRules = RULES; root.FlightModel = FlightModel; root.flightHitsSegment = hitsSegment;
  if (typeof module !== 'undefined') module.exports = { FlightModel, RULES, hitsSegment };
})(typeof window !== 'undefined' ? window : globalThis);
