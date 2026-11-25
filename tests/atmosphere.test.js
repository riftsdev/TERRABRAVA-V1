const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const world={};
new Function('window',fs.readFileSync(path.join(__dirname,'../atmosphere.js'),'utf8'))(world);
const a=world.Atmosphere;
function run(seconds){for(let i=0;i<seconds*60;i++)a.step(1/60);}
assert.equal(a.time(),'08:00');
run(720);assert.ok(Math.abs(a.state.hours-8)<1e-8);
a.nextWeather();a.nextWeather();run(30);
assert.ok(a.state.rain>.99&&a.state.wet>.96);
a.nextWeather();run(5);assert.ok(a.state.wet>.8&&a.state.rain<.05);
const saved=a.snapshot();run(240);assert.ok(a.state.wet<.01);
a.restore(saved);assert.equal(a.state.wet,saved.water);
a.restore({hours:17.5,weather:0,water:0});a.nextTime();assert.ok(a.state.dusk>.7);
a.nextTime();assert.ok(a.state.daylight<.01);a.nextTime();assert.ok(a.state.hours<7);
console.log('OK ciclo de 24 h, saturação, drenagem, retomada e atalhos do relógio');
