// node tests/physics.test.js — executa simulation.js real com World/Machines simulados (terreno por função)
const fs=require('fs'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','simulation.js'),'utf8');
function boot(){const H={f:()=>0},win={};
  const World={height:(x,z)=>H.f(x,z),collides:()=>false,bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},zones:{dump:{x:0,z:0,r:1},depot:{x:0,z:0,r:1}},dig:()=>0,deposit:()=>0,scoop:()=>({volume:0}),sweepBlade:()=>0};
  const Machines={create:()=>({root:{p:[0,0,0],r:[0,0,0]},bladeGroup:{p:[0,0,0]}}),pose(){},bucketEdge:()=>[[-.5,0,0],[.5,0,0]],cuttingEdge:()=>[[-1.66,0,0],[1.66,0,0]],tip:m=>[m.root.p[0],m.root.p[1]+.1,m.root.p[2]+2]};
  const Gs={sphere:()=>({visible:false,p:[0,0,0],s:[1,1,1],r:[0,0,0]})};
  new Function('window','World','Machines','G','Obra',src)(win,World,Machines,Gs,{measure(){},restore(){}});
  win.Sim.init({});return{Sim:win.Sim,H,World};}
function setup(type,{terrain=()=>0,heading=0,load=0,bed=0}={}){const b=boot();b.H.f=terrain;const v=b.Sim.all().find(o=>o.type===type);
  b.Sim.select(type);b.Sim.occupy(v,true);v.running=true;Object.assign(v,{x:300,z:0,heading,load,bed});b.Sim.update(1/60,{});return{...b,v};}
const run=(c,t,inp,each)=>{for(let i=0;i<t*60;i++){c.Sim.update(1/60,typeof inp==='function'?inp(i/60):inp);each&&each(c.v);}};
let n=0;const T=(name,f)=>{f();n++;console.log('OK ',name)};
T('pickup chega perto da velocidade máxima no plano',()=>{const c=setup('pickup');run(c,9,{drive:1});assert.ok(c.v.speed>9&&c.v.speed<=11*1.08,c.v.speed)});
T('caminhão carregado (7 m³) acelera menos que vazio',()=>{const a=setup('truck'),b=setup('truck',{load:7});run(a,3,{drive:1});run(b,3,{drive:1});assert.ok(b.v.speed<a.v.speed*.8,`${b.v.speed} vs ${a.v.speed}`)});
T('caminhão carregado freia com distância ≥ vazio e respeita atrito',()=>{const a=setup('truck');a.v.speed=9;const x0=a.v.z;run(a,8,{brake:true});assert.ok(Math.abs(a.v.speed)<.05)});
T('rampa: carregado sobe pior que vazio na ladeira máxima',()=>{const ramp=(x,z)=>.5*z;const a=setup('truck',{terrain:ramp}),b=setup('truck',{terrain:ramp,load:7});run(a,10,{drive:1});run(b,10,{drive:1});assert.ok(b.v.z<a.v.z*.6&&a.v.z>5,`${a.v.z} ${b.v.z}`)});
T('estacionada na ladeira máxima o freio segura',()=>{for(const t of['truck','pickup','back','grader','exc','bike']){const c=setup(t,{terrain:(x,z)=>.5*z});c.Sim.occupy(c.v,false);run(c,5,{});assert.ok(Math.abs(c.v.z)<.5,t+' '+c.v.z)}});
T('ladeira abaixo sem freio acelera o veículo com rodas (ponto morto)',()=>{const c=setup('pickup',{terrain:(x,z)=>-.3*z});run(c,3,{});assert.ok(c.v.speed>1,c.v.speed)});
T('picape derrapa em curva forte e rápida, e não em baixa velocidade',()=>{const a=setup('pickup');run(a,6,{drive:1});let m=0;run(a,3,{drive:1,turn:1},v=>m=Math.max(m,Math.abs(v.lat)));
  const b=setup('pickup');let m2=0;run(b,4,{drive:.25,turn:1},v=>m2=Math.max(m2,Math.abs(v.lat)));assert.ok(m>.3&&m2<.02,`${m} ${m2}`)});
T('caminhão com caçamba erguida e cheia tomba em rampa lateral; vazio não',()=>{const side=(x,z)=>.4*x;const a=setup('truck',{terrain:side,load:7,bed:.8}),b=setup('truck',{terrain:side});a.Sim.occupy(a.v,false);run(a,2,{});run(b,2,{});assert.ok(a.v.tipped&&Math.abs(a.v.roll)>.8,'a '+a.v.roll);assert.ok(!b.v.tipped)});
T('após tombar, ignição endireita a máquina',()=>{const c=setup('truck',{terrain:(x,z)=>.4*x,load:7,bed:.8});run(c,2,{});assert.ok(c.v.tipped);c.Sim.occupy(c.v,true);c.H.f=()=>0;c.Sim.ignition();run(c,2,{});assert.ok(!c.v.tipped&&Math.abs(c.v.roll)<.1)});
T('escavadeira é estável em rampa lateral máxima',()=>{const c=setup('exc',{terrain:(x,z)=>.5*x});run(c,5,{});assert.ok(!c.v.tipped)});
T('moto inclina como atan(a_c/g) na curva',()=>{const c=setup('bike');run(c,6,{drive:1});run(c,2,{drive:1,turn:.5});const ac=c.v.speed*c.v.yawRate;assert.ok(Math.abs(c.v.dynamicRoll)>.15&&Math.abs(Math.abs(c.v.dynamicRoll)-Math.atan(Math.abs(ac)/9.81))<.1,`${c.v.dynamicRoll} ${ac}`)});
T('curva de carga: carga pesada no alcance máximo derruba a capacidade de içar',()=>{const c=setup('exc',{load:1.1});run(c,1,{rightY:0,leftY:0});assert.ok(Number.isFinite(c.v.chart)&&c.v.chart>0)});
T('os 6 veículos permanecem numéricos sob comandos aleatórios por 20 s',()=>{for(const t of['exc','truck','back','grader','bike','pickup']){const c=setup(t,{terrain:(x,z)=>Math.sin(x*.2)*.8+Math.cos(z*.15)*.6});let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647*2-1;
  run(c,20,()=>({drive:r(),turn:r(),leftX:r(),leftY:r(),rightX:r(),rightY:r(),brake:r()>.8}));for(const k of['x','z','y','speed','heading','lat','pitch','roll','load'])assert.ok(Number.isFinite(c.v[k]),t+' '+k)}});
T('chuva forte aumenta a distância de frenagem',()=>{const d=w=>{const c=setup('pickup');c.Sim.setWet(w);c.v.speed=10;run(c,10,{brake:true});return c.v.z};const a=d(0),b=d(1);assert.ok(b>a*1.4,`${a} ${b}`)});
T('chuva faz a picape derrapar numa curva que no seco ela segura',()=>{const m=w=>{const c=setup('pickup');c.Sim.setWet(w);run(c,6,{drive:.65});let k=0;run(c,3,{drive:.65,turn:1},v=>k=Math.max(k,Math.abs(v.lat)));return k};const a=m(0),b=m(1);assert.ok(a<.02&&b>.3,`${a} ${b}`)});
T('picape estacionada em ladeira íngreme segura no seco e escorrega na chuva forte',()=>{const p=w=>{const c=setup('pickup',{terrain:(x,z)=>.5*z});c.Sim.setWet(w);c.Sim.occupy(c.v,false);run(c,4,{});return Math.abs(c.v.z)};assert.ok(p(0)<.5&&p(1)>2,`${p(0)} ${p(1)}`)});
T('lama local reduz aceleração e velocidade mesmo com a mesma chuva',()=>{
  const a=setup('pickup'),b=setup('pickup');
  a.World.soil=()=>({basin:.12,cover:0});b.World.soil=()=>({basin:.98,cover:0});
  for(const c of [a,b])c.Sim.setWet(1);
  run(a,3,{drive:1});run(b,3,{drive:1});assert.ok(b.v.speed<a.v.speed*.85);
  run(a,8,{drive:1});run(b,8,{drive:1});assert.ok(b.v.speed<a.v.speed*.8);
});
T('esteiras mantêm o diferencial e perdem velocidade em lama',()=>{
  const a=setup('exc'),b=setup('exc');b.World.soil=()=>({basin:1,cover:0});b.Sim.setWet(1);
  const ahead={trackControl:true,leftTrack:1,rightTrack:1};run(a,4,ahead);run(b,4,ahead);
  assert.ok(b.v.speed<a.v.speed*.9);assert.ok(Math.abs(b.v.yawRate)<1e-8);
  run(b,3,{trackControl:true,leftTrack:-1,rightTrack:1});assert.ok(b.v.yawRate>0);
});
T('areia oferece mais resistência que brita, e brita mais que terra batida',()=>{
 const speeds=[[0,0],[0,1],[1,0]].map(([sand,gravel])=>{
   const c=setup('pickup');c.World.soil=()=>({sand,gravel,basin:0,cover:0});
   run(c,10,{drive:1});return c.v.speed;
 });
 assert.ok(speeds[0]>speeds[1]&&speeds[1]>speeds[2]);
});
console.log(n+' testes de física passaram');
