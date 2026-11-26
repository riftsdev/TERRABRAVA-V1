// Exercise the real buckets, heightfields, hydraulic axes and pooled parcels.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({performance,console});ctx.window=ctx;
for(const file of ['engine','rural','world','machines','obra','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file+'.js'),'utf8'),ctx);
const {World:W,Rural:R,Sim:S,G}=ctx,root=G.group();W.create(root);S.init(root);
const run=(frames,input={})=>{for(let i=0;i<frames;i++)S.update(1/60,{mode:'work',...input});};
const parcel=(x,z,wet=0)=>{
  const y=W.height(x,z),edge=[[-.45,0],[.45,0]].map(([d])=>[x+d,y-.23,z]);
  const before=edge.map(([a,b,c])=>[a,b+.03,c-.12]);
  assert.equal(W.scoop(edge,edge,1,wet).volume,0);
  assert.equal(W.scoop(before.map(p=>p.map((v,i)=>i===1?v+3:v)),edge.map(p=>p.map((v,i)=>i===1?v+3:v)),1,wet).volume,0);
  const cut=W.scoop(before,edge,1,wet);assert(cut.volume>0);assert(W.height(x,z)<y);assert.equal(W.soil(x,z).cover,0);
  return cut;
};
const lip=[[-.5,W.height(0,4)-.3,4],[.5,W.height(0,4)-.3,4]];
const swept=lip.map(([x,y,z])=>[x,y+.12,z-.15]);
assert.equal(W.scoop(swept,lip,0,0).volume,0);
assert(Math.abs(W.scoop(swept,lip,.001,0).volume-.001)<1e-7);
const sand=parcel(204,181),stone=parcel(320,-222),dry=parcel(225,230),mud=parcel(226,231,1);
assert(sand.flow>dry.flow&&dry.flow>stone.flow&&mud.flow<dry.flow);
assert(W.deposit(-31,-6,1.3,.5)===0);const h=W.height(80,14);
assert(W.deposit(80,14,1.5,.5)>.4999&&W.height(80,14)>h);
for(const [type,tool,x,z] of [['exc','bucket',0,4],['back','front',210,180],['back','rear',180,195]]){
 const v=S.select(type);S.occupy(v,true);S.ignition();Object.assign(v,{x,z,y:W.height(x,z),heading:0,tool,stabilizers:tool==='rear'?1:0,capacity:tool==='rear'?.38:type==='exc'?1.1:.95,curl:.03,frontCurl:.03,boom:.5,stick:.6,frontLift:.4,load:0});
 const initial=v.volume.dug;
 run(100,{rightY:1});run(55,{rightX:-1,drive:tool==='front'?1:0});
 assert(v.volume.dug>initial,type+'/'+tool+' should collect soil');
 assert(v.load<=v.capacity&&v.load>0);const fill=tool==='front'?v.model.front.earth:v.model.arm.earth;
 assert(fill.visible);const level=tool==='front'?v.frontLift:v.boom;
 run(80,{rightY:-1});assert((tool==='front'?v.frontLift:v.boom)>level);
 run(180,{rightX:1});run(120);assert(v.load<.001);
}
// Resume a save mid-air above the bed. The same packets must reach the truck,
// persist there, then land on the ground when the driver raises the bed.
const saved=S.snapshot(),truck=S.all().find(m=>m.type==='truck');
const vol=.40,floor=W.snapshot(),rural=R.snapshot();
saved.pieces=[{source:'exc',tool:'bucket',volume:vol,flow:sand.flow,x:truck.x,y:truck.y+4,z:truck.z,vx:0,vy:0,vz:0,life:0}];
assert(S.restore(saved));run(150);assert(Math.abs(truck.load-vol)<1e-5);
const loaded=S.snapshot();assert(S.restore(loaded));S.select('truck');S.occupy(truck,true);S.ignition();
const total=()=>W.snapshot().reduce((n,v,i)=>n+(i%2?v/1000:0),0)+R.snapshot().edits.reduce((n,p)=>n+p[1],0);
const start=total();run(240,{rightY:-1});run(180);
assert(truck.load<.001&&Math.abs(total()-start-vol)<.012);
assert(W.restore(floor));R.restore(rural);W.refreshSurface();assert(R.bare(204,181));
console.log('Três conchas, contato, cobertura, materiais, capacidade, basculamento, conservação e retomada OK.');
