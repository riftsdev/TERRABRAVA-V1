// Exercise the real scene graph and streaming code without a graphics context.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const env=vm.createContext({performance,console});env.window=env;
for(const file of ['engine','rural','world'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file+'.js'),'utf8'),env);
const {World,Rural,G}=env,root=G.group();World.create(root);
const sectors=root.children[1];
function visit(x,z,r=64){for(let i=0;i<125;i++)World.stream(x,z,r);}
assert.equal(World.bounds.maxX-World.bounds.minX,1024);
visit(235,180);const before=World.height(205,183);
assert(World.dig(205,183,2,1)>.99);assert(World.height(205,183)<before);
const edited=World.height(205,183);
assert(World.deposit(210,183,2,.7)>.69);assert(World.grade(205,183,2.5,.1)>0);
assert(World.soil(204,181).sand);assert(World.soil(320,-222).gravel);
assert.equal(World.dig(-218,98,2,1),0);assert.equal(World.dig(-31,-6,2,1),0);
const tree=Rural.nearbyTrees(235,180,40)[0];assert(tree.parts.trunk&&tree.id&&tree.cutPoints.length&&tree.diameter);
assert(World.collides(tree.x,tree.z,.2));assert(Rural.setTreeState(tree.id,'derrubada',.75,['tora-1']));
const saved=JSON.parse(JSON.stringify(Rural.snapshot())),h=World.height(205,183);
visit(-436,431);assert.equal(Rural.nearbyTrees(tree.x,tree.z,1).length,0);
assert(sectors.children.length<24);visit(235,180,160);assert(sectors.children.length>24);
Rural.restore(saved);visit(235,180);
assert.equal(World.height(205,183),h);const restored=Rural.nearbyTrees(tree.x,tree.z,.2)[0];
assert.equal(restored.fallHeading,.75);assert(restored.parts.fallenTrunk);assert.equal(restored.logs[0],'tora-1');
Rural.setTreeState(tree.id,'removida');assert(!World.collides(tree.x,tree.z,.1));
assert(Math.abs(World.height(80,10)-World.height(80.001,10))<.02);
assert(World.height(0,0)===World.height(0,0));assert(edited<before);
console.log('Mapa, limites, fundações, materiais, deformação, LOD, descarregamento e persistência da vegetação: OK');
