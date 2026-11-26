// Rural sectors use metre coordinates and retain only modified height samples and tree states.
window.Rural=(()=>{
  const size=32,limit=512,live=new Map(),edits=new Map(),treeStates=new Map();
  const bounds={minX:-limit,maxX:limit,minZ:-limit,maxZ:limit};
  const sites=[
    ['Fazenda do Ipê',-218,98,'casa'],['Sítio Boa Vista',262,94,'casa'],
    ['Garagem rural',-152,52,'galpão'],['Garagem da serra',324,-105,'galpão'],
    ['Obra da ponte',152,98,'obra'],['Saibreira',-246,-178,'terra'],
    ['Areal',204,181,'areia'],['Pedreira',320,-222,'brita']
  ];
  const roads=[
    [[-512,174],[-350,140],[-218,85],[-152,65],[-85,27],[-48,17]],
    [[52,38],[110,65],[152,88],[207,109],[262,80],[370,109],[512,86]],
    [[-218,85],[-260,-10],[-292,-114],[-246,-178],[-310,-310],[-380,-512]],
    [[207,109],[204,181],[250,288],[205,512]],
    [[262,80],[292,-16],[324,-91],[320,-222],[412,-350],[512,-382]]
  ];
  const trail=[[-48,17],[-80,64],[-56,115],[-98,166],[-82,216],[-136,260],[-174,212],[-148,153],[-218,85]];
  const key=(i,j)=>i+','+j,cell=n=>Math.floor(n/size);
  const yard=(x,z)=>x>=-48&&x<=80&&z>=-40&&z<=40;
  const exposed=new Set();
  const bare=(x,z)=>exposed.has(code(Math.round(x),Math.round(z)));
  const code=(x,z)=>(x+512)+(z+512)*1025;
  const hash=(x,z)=>{let h=Math.imul(x^11237,1597334677)^Math.imul(z^731,3812015801);h=Math.imul(h^(h>>>16),2246822519);return ((h^(h>>>13))>>>0)/4294967296;};
  const relief=(x,z)=>9+11*Math.sin(x*.013)+8*Math.cos(z*.017+x*.005)+5*Math.sin((x-z)*.026);
  let baseline,core,root,last='',queue=[],range=96,lastSculpt=0;
  function farmHeight(x,z){
    const ground=relief(x,z);
    for(const [,a,b,k] of sites){
      if(k!=='galpão'&&k!=='casa'&&k!=='obra')continue;
      const edge=Math.max(Math.abs(x-a)-(k==='galpão'?8:5),Math.abs(z-b)-5);
      if(edge<5){const f=Math.max(0,edge)/5;return ground*f+relief(a,b)*(1-f);}
    }
    return ground;
  }
  function base(x,z){
    const xx=Math.max(-48,Math.min(80,x)),zz=Math.max(-40,Math.min(40,z));
    const d=Math.hypot(x-xx,z-zz),t=Math.min(1,d/28);
    return t===1?farmHeight(x,z):baseline(xx,zz)*(1-t)+farmHeight(x,z)*t;
  }
  function point(x,z){if(yard(x,z))return core(x,z);return base(x,z)+(edits.get(code(x,z))||0);}
  function height(x,z){
    const i=Math.floor(x),j=Math.floor(z),u=x-i,v=z-j;
    if(u+v<=1){const a=point(i,j);return a+(point(i+1,j)-a)*u+(point(i,j+1)-a)*v;}
    const a=point(i+1,j+1);return a+(point(i,j+1)-a)*(1-u)+(point(i+1,j)-a)*(1-v);
  }
  const segments=[];
  for(const path of [...roads,trail])for(let i=1;i<path.length;i++){
    const [x,z]=path[i-1],dx=path[i][0]-x,dz=path[i][1]-z;
    segments.push({x,z,dx,dz,length:dx*dx+dz*dz,width:path===trail?1.8:4.4});
  }
  function onRoad(x,z){
    return segments.some(s=>{
      if(x<Math.min(s.x,s.x+s.dx)-5||x>Math.max(s.x,s.x+s.dx)+5||z<Math.min(s.z,s.z+s.dz)-5||z>Math.max(s.z,s.z+s.dz)+5)return false;
      const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.length));
      return (x-s.x-s.dx*t)**2+(z-s.z-s.dz*t)**2<s.width**2;
    });
  }
  function soil(x,z){
    const work=sites.find(([,a,b,k])=>['terra','areia','brita','obra'].includes(k)&&(x-a)**2+(z-b)**2<19**2);
    return {basin:.42+.17*Math.sin(z*.04),sand:Number(work?.[3]==='areia'),gravel:Number(work?.[3]==='brita'),cover:work||bare(x,z)||onRoad(x,z)?0:.95};
  }
  function foundation(x,z){
    return sites.some(([,a,b,k])=>['casa','galpão'].includes(k)&&Math.abs(x-a)<(k==='casa'?5:8)+1&&Math.abs(z-b)<6)||sites.some(([,a,b,k])=>k==='obra'&&Math.abs(Math.abs(x-a)-5)<1.5&&Math.abs(z-b)<4.5);
  }
  function mark(x,z){
    for(const i of new Set([cell(x),cell(x-1)]))for(const j of new Set([cell(z),cell(z-1)])){
      touched.add(key(i,j));const c=live.get(key(i,j));if(c)c.dirty=true;
    }
  }
  function bladeRoom(x,z,dir){
    if(Math.abs(x)>=limit||Math.abs(z)>=limit||foundation(x,z))return 0;
    const delta=edits.get(code(x,z))||0;return dir>0?7-delta:3+delta;
  }
  function bladeChange(x,z,delta){
    const k=code(x,z);edits.set(k,(edits.get(k)||0)+delta);mark(x,z);
  }
  function modify(x,z,r,volume,dir,angle=0){
    if(!(volume>0))return 0;
    r=Math.max(dir?1.05:1.85,r);const hits=[];let sum=0,total=0;
    for(let a=Math.ceil(x-r);a<=x+r;a++)for(let b=Math.ceil(z-r);b<=z+r;b++){
      if(Math.abs(a)>=limit||Math.abs(b)>=limit||yard(a,b)||foundation(a,b))continue;
      const w=1-((a-x)**2+(b-z)**2)/r**2;if(w<=0)continue;
      const k=code(a,b),d=edits.get(k)||0,h=base(a,b)+d-.035*Math.sin(angle)*(a-x);
      hits.push({a,b,k,d,w,h});sum+=w*h;total+=w;
    }
    let cut=0,fill=0;
    for(const q of hits){
      q.change=dir?dir*volume*q.w/total:(sum/total-q.h)*q.w;
      q.change=Math.max(-3-q.d,Math.min(7-q.d,q.change));
      if(q.change<0)cut-=q.change;else fill+=q.change;
    }
    const moved=dir?(dir>0?fill:cut):Math.min(cut,fill,volume);
    if(moved<1e-8)return 0;
    for(const q of hits){const delta=q.change*(dir?1:moved/(q.change<0?cut:fill));if(!delta)continue;
      const value=q.d+delta;if(Math.abs(value)<1e-7)edits.delete(q.k);else edits.set(q.k,value);mark(q.a,q.b);}
    return moved;
  }
  function terrain(c){
    const p=[],ix=[],colors=[],step=c.step,side=size/step+1;
    for(let j=0;j<side;j++)for(let i=0;i<side;i++){
      const x=c.x+i*step,z=c.z+j*step,h=height(x,z),s=soil(x,z);
      const disturbed=Math.abs(edits.get(code(x,z))||0)>.02;
      const col=s.sand?[.78,.65,.43]:s.gravel?[.49,.50,.48]:s.cover&&!disturbed?[.37,.47,.24]:[.64,.43,.28];
      const light=.93+.08*hash(x,z);p.push(x,h,z);colors.push(...col.map(v=>v*light));
      if(i&&j&&!yard(x-step/2,z-step/2)){const k=i+j*side;ix.push(k-side-1,k-1,k-side,k-side,k-1,k);}
    }
    // Skirts hide gaps where adjacent grids have different resolutions.
    for(let i=0;i<side-1;i++)for(const [a,b] of [[i,i+1],[(side-1)*side+i,(side-1)*side+i+1],[i*side,(i+1)*side],[i*side+side-1,(i+1)*side+side-1]]){
      if(yard((p[3*a]+p[3*b])/2,(p[3*a+2]+p[3*b+2])/2))continue;
      const k=p.length/3;for(const t of [a,b]){p.push(p[t*3],p[t*3+1]-1.5,p[t*3+2]);colors.push(...colors.slice(t*3,t*3+3));}
      ix.push(a,b,k,k,b,k+1);
    }
    if(c.mesh)G.updateMesh(c.mesh,p,ix,'#ffffff',colors);else if(ix.length)c.mesh=G.mesh(c.group,p,ix,'#ffffff',colors);
    c.dirty=false;
  }
  function furniture(c){
    const box=(x,y,z,w,h,d,col)=>G.box(c.group,[x,y,z],[w,h,d],col);
    for(const [,x,z,k] of sites){
      if(cell(x)!==cell(c.x)||cell(z)!==cell(c.z))continue;
      const y=height(x,z);
      if(k==='casa'){
        box(x,y+1.25,z,9,3.5,6,'#d9c097');
        for(const s of [-1,1])box(x,y+3.5,z+s*1.62,10,.22,3.7,'#aa6045').r[0]=s*.30;
        box(x,y+1,z+3.05,1.1,2,.12,'#685342');for(const s of [-1,1])box(x+2.7*s,y+1.7,z+3.06,1.3,.95,.12,'#537579');
        c.walls.push([x,z,4.5,3]);
      }else if(k==='galpão'){
        box(x,y+.03,z,15,.20,9,'#867e6d');box(x,y+4.1,z,16,.26,10,'#738580');
        for(const s of [-1,1]){box(x+s*7.4,y+2,z,.2,4,9,'#78847a');c.walls.push([x+s*7.4,z,.1,4.5]);}
        box(x,y+2,z-4.4,15,4,.2,'#78847a');c.walls.push([x,z-4.4,7.5,.1]);
      }else if(k==='obra'){for(const s of [-1,1]){box(x+s*5,y+.6,z,1,1.3,7,'#958a78');c.walls.push([x+s*5,z,.5,3.5]);}}
    }
    if(c.z===128&&c.x>=-320&&c.x<-128){
      for(let i=0;i<32;i+=4){const x=c.x+i,z=145;if(onRoad(x,z))continue;const y=height(x,z);
        box(x,y+.65,z,.16,1.5,.16,'#846849');for(const h of [.48,.92])G.beam(c.group,[x,y+h,z],[x+4,height(x+4,z)+h,z],.05,.05,'#847b67');
        c.walls.push([x+2,z,2,.1]);}
    }
  }
  const groves=new Map();
  function trees(c){
    const forest=Math.sin(c.x*.018)+Math.cos(c.z*.021)>.35;
    const grove=groves.get(c.id)||[],count=forest?14:3;
    for(let i=0;i<count+grove.length;i++){
      const seed=(c.x+512)*1024+c.z+512,extra=i>=count,x=extra?grove[i-count][0]:c.x+1+30*hash(seed,i*4),z=extra?grove[i-count][1]:c.z+1+30*hash(seed,i*4+1);
      if((!extra&&yard(x,z))||onRoad(x,z)||sites.some(([,a,b])=>(a-x)**2+(b-z)**2<22**2))continue;
      const id=key(cell(x),cell(z))+':'+i,record=treeStates.get(id),state=record?.state||'em_pe',h=5+7*hash(seed,i*4+2),dia=h*.049;
      const type=hash(seed,i*4+3)>.63?'araucária':'ipê',y=yard(x,z)?core(x,z):height(x,z);
      const t={id,type,x,y,z,height:h,diameter:dia,resistance:type==='ipê'?95:70,state,cutPoints:[.28,h*.4,h*.7],fallHeading:record?.fallHeading??null,logs:record?.logs||[],parts:{}};
      c.trees.push(t);if(c.lod===2&&i%2)continue;
      if(state==='removida')continue;
      const standing=state==='em_pe',trunk=standing?h*.72:.28;
      t.parts.trunk=G.cyl(c.group,[x,y+trunk/2,z],dia*.47,dia*.50,trunk,'#765e46',6);
      if(state==='derrubada'){
        const angle=t.fallHeading||0,end=[x+Math.sin(angle)*h*.72,y+dia*.48,z+Math.cos(angle)*h*.72];
        t.parts.fallenTrunk=G.rod(c.group,[x,y+dia*.48,z],end,dia*.48,'#765e46',6);
      }
      if(!standing)continue;
      const pine=type==='araucária';t.parts.crown=G.sphere(c.group,[x,y+h*.78,z],[h*.23,h*(pine?.15:.26),h*.22],pine?'#405e42':'#567940',c.lod===0?7:4);
      if(c.lod===0)t.parts.branch=G.rod(c.group,[x,y+h*.42,z],[x+h*.13,y+h*.73,z],dia*.25,'#765e46',5);
    }
  }
  function remove(c){
    if(c.mesh)G.releaseMesh(c.mesh);
    root.children.splice(root.children.indexOf(c.group),1);live.delete(c.id);
  }
  function build(i,j,lod){
    const id=key(i,j),c={id,x:i*size,z:j*size,lod,step:[2,4,8][lod],group:G.group(root),trees:[],walls:[]};
    if(lod===0&&changedSector(i,j))c.step=1;
    terrain(c);furniture(c);trees(c);live.set(id,c);
  }
  const touched=new Set();
  function changedSector(i,j){return touched.has(key(i,j));}
  function stream(x,z){
    const i=cell(x),j=cell(z),stamp=key(i,j)+':'+range;
    if(stamp!==last){
      last=stamp;queue=[];const wanted=new Map(),radius=range/32;
      for(let b=-radius;b<=radius;b++)for(let a=-radius;a<=radius;a++){
        const k=i+a,l=j+b,d=Math.hypot(a,b);if(d>radius+.3||k< -16||k>=16||l< -16||l>=16)continue;
        const lod=d<=1.5?0:d<=3?1:2,id=key(k,l);wanted.set(id,lod);
        if(live.get(id)?.lod!==lod)queue.push({k,l,lod,d});
      }
      for(const [id,c] of live)if(!wanted.has(id))remove(c);
      queue.sort((a,b)=>a.d-b.d);
    }
    const start=performance.now();
    while(queue.length){const {k,l,lod}=queue.shift(),old=live.get(key(k,l));if(old)remove(old);build(k,l,lod);if(performance.now()-start>3)break;}
    if(start-lastSculpt>=90){
      for(const c of live.values())if(c.dirty){if(c.lod===0)c.step=1;terrain(c);}
      lastSculpt=start;
    }
  }
  function collides(x,z,r){
    for(let j=cell(z-r-9);j<=cell(z+r+9);j++)for(let i=cell(x-r-9);i<=cell(x+r+9);i++){
      const c=live.get(key(i,j));if(!c)continue;
      if(c.walls.some(([a,b,w,d])=>Math.hypot(Math.max(0,Math.abs(x-a)-w),Math.max(0,Math.abs(z-b)-d))<r))return true;
      if(c.trees.some(t=>t.state!=='removida'&&Math.hypot(t.x-x,t.z-z)<r+t.diameter/2))return true;
    }return false;
  }
  // A future cutting/hauling tool owns physics and log entities. Store its stable
  // log IDs and fall direction independently of render nodes and sector lifetime.
  function setTreeState(id,state,fallHeading=0,logs=[]){
    if(!Number.isFinite(fallHeading)||!Array.isArray(logs)||!logs.every(v=>typeof v==='string'))return false;
    if(!/^(-?\d+),(-?\d+):\d+$/.test(id)||!['em_pe','derrubada','toco','removida'].includes(state))return false;
    if(state==='em_pe')treeStates.delete(id);else treeStates.set(id,{state,fallHeading,logs:logs.slice()});
    const c=live.get(id.split(':')[0]);if(c){const [i,j]=c.id.split(',').map(Number);remove(c);build(i,j,c.lod);}return true;
  }
  function restore(data){
    edits.clear();treeStates.clear();touched.clear();exposed.clear();
    for(const k of data?.exposed||[])if(Number.isInteger(k)&&k>=0&&k<1025**2){
      exposed.add(k);mark(k%1025-512,Math.floor(k/1025)-512);
    }
    for(const [k,v] of data?.edits||[])if(Number.isInteger(k)&&k>=0&&k<1025**2&&Number.isFinite(v)){const x=k%1025-512,z=Math.floor(k/1025)-512;edits.set(k,Math.max(-3,Math.min(7,v)));mark(x,z);}
    for(const [id,record] of data?.trees||[])if(record)setTreeState(id,record.state,record.fallHeading,record.logs);
    for(const c of [...live.values()])remove(c);last='';
  }
  return {bounds,roads,trail,sites,yard,height,soil,modify,collides,stream,setTreeState,
    nearbyTrees(x,z,r=12){const found=[];for(const c of live.values())if(Math.abs(c.x+16-x)<16+r&&Math.abs(c.z+16-z)<16+r)for(const t of c.trees)if(Math.hypot(t.x-x,t.z-z)<=r)found.push(t);return found;},
    registerGrove(points){groves.clear();for(const p of points){const id=key(cell(p[0]),cell(p[1]));if(!groves.has(id))groves.set(id,[]);groves.get(id).push(p);}},
    init(parent,current,original=current){root=G.group(parent);core=current;baseline=original;live.clear();last='';restore(null);},
    setRange(v){range=[64,96,160].includes(+v)?+v:96;},
    bare,expose(x,z){exposed.add(code(x,z));},bladeRoom,bladeChange,mark,
    snapshot:()=>({exposed:[...exposed],edits:[...edits],trees:[...treeStates]}),restore};
})();
