// Run the real heightfields, blade transform and fixed-step vehicle simulation.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({performance,console});ctx.window=ctx;
for(const file of ['engine','rural','world','machines','obra','simulation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file+'.js'),'utf8'),ctx);
const {World:W,Rural:R,Sim:S,G}=ctx,root=G.group();W.create(root);
function pass(cx,cz,angle){
  const original=new Map();
  for(let x=cx-5;x<=cx+5;x++)for(let z=cz-4;z<=cz+6;z++)original.set([x,z].join(),W.height(x,z));
  let moved=0;const signedX=Math.cos(angle)*1.66,signedZ=-Math.sin(angle)*1.66;
  for(let i=0;i<24;i++){
    const z=cz+i*.10;
    const edge=(s,lift)=>{const a=cx+s*signedX,b=z+s*signedZ;return [a,W.height(a,b)+lift,b];};
    assert.equal(W.sweepBlade(edge(-1,3),edge(1,3),0,.1),0);
    assert.equal(W.sweepBlade(edge(-1,-.22),edge(1,-.22),0,0),0);
    moved+=W.sweepBlade(edge(-1,-.22),edge(1,-.22),0,.1);
  }
  let cut=0,fill=0,moment=0,peak=null,highest=0;
  for(const [key,h] of original){const [x,z]=key.split(',').map(Number),diff=W.height(x,z)-h;
    if(diff<0)cut-=diff;else{fill+=diff;moment+=diff*(x-cx);if(diff>highest){peak=[x,z];highest=diff;}}}
  assert(moved>.2&&cut>.1&&fill>.1);
  assert(Math.abs(cut-fill)<.0001);assert(moment*Math.sign(angle)>0);
  for(const [key,h] of original){const [x,z]=key.split(",").map(Number);if(W.height(x,z)<h-.0001)assert.equal(W.soil(x,z).cover,0);}
  assert(!R.bare(cx-5,cz));
  const [px,pz]=peak,top=W.height(px,pz);
  const recut=W.sweepBlade([px-1.66,top-.15,pz],[px+1.66,top-.15,pz],0,.18);
  assert(recut>0&&W.height(px,pz)<top,'a segunda passada deve cortar a própria leira');
}
pass(216,232,.70);pass(-214,230,-.70);pass(80,15,.74);pass(5,24,-.74);
assert.equal(W.sweepBlade([-32,-5,-6],[-30,-5,-6],0,.1),0);
const save=JSON.parse(JSON.stringify(R.snapshot())),yard=W.snapshot();
R.restore(null);W.restore(yard);R.restore(save);W.refreshSurface();
assert(R.bare(216,233)&&R.bare(5,25));assert.equal(W.soil(5,25).cover,0);
S.init(root);const grader=S.select('grader');S.occupy(grader,true);grader.running=true;grader.blade=1;
const advance=n=>{for(let i=0;i<n;i++)S.update(1/60,{drive:1,mode:'drive'});};
advance(140);assert.equal(grader.volume.graded,0);grader.blade=0;grader.bladeAngle=.75;
advance(200);assert(grader.volume.graded>.02);
console.log('Patrol: comando de elevação, contato, leiras nos dois lados, conservação, retrabalho, fundações, emenda e salvamento OK.');
