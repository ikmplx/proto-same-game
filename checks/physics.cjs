'use strict';
const assert = require('node:assert/strict');
const { FlightModel, RULES, hitsSegment, normalizeParameters } = require('../flight-model.js');
assert.equal(RULES.lift, 550 * 1.2);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const ballistic = new FlightModel(40);
ballistic.launch();
const { x, y, vx, vy } = ballistic;
for (let i = 0; i < 120; i++) ballistic.advance(1 / 120, false);
near(ballistic.x, x + vx);
near(ballistic.y, y + vy + RULES.gravity / 2);
near(ballistic.vy, vy + RULES.gravity);
assert.equal(ballistic.fuel, 100);
const powered = new FlightModel(40); powered.launch();
for (let i = 0; i < 120; i++) powered.advance(1 / 120, true);
near(powered.fuel, 82);
near(powered.vy, vy + RULES.gravity - RULES.lift);
assert.ok(powered.y < ballistic.y);
// Последняя капля не создаёт бесплатную тягу на весь шаг.
powered.fuel = .09; powered.vy = 0;
powered.advance(.01, true);
near(powered.vy, (RULES.gravity - RULES.lift) * .005 + RULES.gravity * .005);
assert.equal(powered.fuel, 0);
powered.advance(.1, true);
assert.equal(powered.lifting, false);
assert.ok(powered.vy > 0);
powered.addFuel(); assert.equal(powered.fuel, 30);
powered.fuel = 90; powered.addFuel(); assert.equal(powered.fuel, 100);
let steps = 0;
while (ballistic.phase === 'flying' && steps++ < 5000) ballistic.advance(1 / 120, false);
assert.equal(ballistic.phase, 'landed'); assert.equal(ballistic.y, RULES.ground);
const stopped = ballistic.x; ballistic.advance(1, true); assert.equal(ballistic.x, stopped);
ballistic.reset(75);
assert.equal(ballistic.phase, 'ready'); assert.equal(ballistic.coins, 0); assert.equal(ballistic.fuel, 100); assert.equal(ballistic.distance, 0);
assert.equal(ballistic.angle, 50);
assert.equal(new FlightModel(5).angle, 15);
const low = new FlightModel(15), high = new FlightModel(50); low.launch(); high.launch();
assert.equal(low.vx, high.vx); assert.ok(low.vy > high.vy);
// Все углы дают один горизонтальный темп; вертикальная скорость сохраняет выбранное направление.
for (let angle = 15; angle <= 50; angle++) {
  for (const lift of [false, true]) {
    const model = new FlightModel(angle);
    model.launch();
    const startX = model.x;
    assert.equal(model.vx, RULES.horizontalSpeed);
    near(Math.atan2(-model.vy, model.vx) * 180 / Math.PI, angle);
    for (let i = 0; i < 60; i++) model.advance(1 / 120, lift);
    assert.equal(model.vx, RULES.horizontalSpeed);
    near(model.x - startX, RULES.horizontalSpeed * .5);
  }
}
assert.equal(hitsSegment(50, 10, 0, 0, 100, 0, 11), true);
assert.equal(hitsSegment(50, 12, 0, 0, 100, 0, 11), false);
assert.equal(hitsSegment(0, 0, 0, 0, 0, 0, 1), true);
assert.deepEqual(normalizeParameters({angle:999,canisterFrequency:-1,canisterVolume:NaN,liftPercent:Infinity}),
  {angle:50,canisterFrequency:0,canisterVolume:30,liftPercent:100});
assert.deepEqual(normalizeParameters(null),normalizeParameters());
const configurable = new FlightModel(40,{canisterVolume:55,liftPercent:150});
configurable.launch(); const startVy = configurable.vy;
configurable.advance(.5,true);
near(configurable.vy,startVy+(RULES.gravity-RULES.lift*1.5)*.5);
configurable.fuel=10; configurable.addFuel(); assert.equal(configurable.fuel,65);
configurable.setParameters({liftPercent:0});
const idleFuel=configurable.fuel; configurable.advance(.1,true);
assert.equal(configurable.fuel,idleFuel); assert.equal(configurable.lifting,false);
console.log('PASS: ballistic trajectory, lift, fuel, empty tank, refill, landing, reset, angles, swept collection');
