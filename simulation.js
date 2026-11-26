/* Terra Brava — vehicle dynamics, hydraulic attachments and loose material. */
(() => {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a,b,t) => a + (b-a)*t;
  const smooth = (a,b,k,dt) => mix(a,b,1-Math.exp(-k*dt));
  const approach = (a,b,step) => a + clamp(b-a,-step,step);
  const length = Math.hypot;
  const types = ['exc','truck','back','grader','bike','pickup'];
  const rad = Math.PI / 180;
  const step = 1/60;
  const G9 = 9.81, SOIL = 1.7; // gravidade (m/s²) e densidade da terra solta (t/m³)
  // m = massa vazia (t), h = altura do centro de gravidade (m), mu = aderência em terra batida, grade = rampa máxima (tan) com potência plena
  const phys = {
    bike:{m:.24,h:.62,mu:.55,grade:.75}, pickup:{m:2.6,h:.82,mu:.62,grade:.85}, exc:{m:26,h:1.45,mu:.8,grade:.7},
    back:{m:8.2,h:1.25,mu:.65,grade:.55}, grader:{m:15,h:1.55,mu:.55,grade:.45}, truck:{m:12.5,h:1.7,mu:.55,grade:.5}
  };
  let wet = 0; // 0 seco · 1 chuva forte: reduz a aderência em até 40%
  const mass = v => phys[v.type].m + (v.load||0)*SOIL;
  // length and track are distances between the average contact patches.
  const info = {
    bike: {x:-5,z:-6,heading:0,length:1.62,track:.34,radius:.36,nose:.65,tail:-.65,drive:12,reverse:1.6,accel:3.9,stop:6,steering:28*rad,capacity:0},
    pickup:{x:-14,z:-12,heading:.4,length:2.75,track:1.66,radius:.9,nose:1.4,tail:-1.4,drive:11,reverse:3,accel:2.4,stop:5.2,steering:34*rad,capacity:0},
    exc:   {x:0,z:-2,heading:0,length:2.85,track:2.35,radius:1.20,nose:0.85,tail:-0.85,drive:1.60,reverse:1.30,accel:0.90,stop:2.20,steering:0,capacity:1.10},
    back:  {x:-11,z:-3,heading:0.24,length:2.46,track:1.82,radius:0.98,nose:1.10,tail:-1.10,drive:5.8,reverse:2.6,accel:1.55,stop:3.7,steering:34*rad,capacity:0.95},
    grader:{x:11,z:-16,heading:Math.PI/2,length:4.62,track:2.00,radius:1.02,nose:2.55,tail:-2.10,drive:6.0,reverse:2.45,accel:1.15,stop:3.25,steering:35*rad,capacity:0},
    truck: {x:5.8,z:0,heading:0,length:4.18,track:2.0,radius:1.12,nose:2.25,tail:-2.30,drive:10.5,reverse:2.9,accel:1.60,stop:4.55,steering:34*rad,capacity:7.0}
  };
  let fleet=[], selected=null, pieces=[], history, gradeCells, clock=0, accumulator=0, seed=725983;
  const soilTones = ['#995b32','#824727','#ad7041','#885534','#b47b48'];
  const goals = {dig:0.50,deliver:0.45,grade:12};
  const next = () => ((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const zone = (name,x,z) => {const q=World.zones[name];return length(x-q.x,z-q.z)<=q.r;};
  function workCell(x,z) {
    const {minX,maxX,minZ,maxZ}=World.bounds;
    return x>=minX&&x<maxX&&z>=minZ&&z<maxZ?Math.floor(x)+','+Math.floor(z):null;
  }
  function point(v, side, along) {
    const si=Math.sin(v.heading),co=Math.cos(v.heading);
    return [v.x+co*side+si*along,v.z-si*side+co*along];
  }
  function local(v,x,z) {
    const dx=x-v.x,dz=z-v.z,si=Math.sin(v.heading),co=Math.cos(v.heading);
    return [dx*co-dz*si,dx*si+dz*co];
  }
  function contactPlane(v) {
    const k=info[v.type], hl=k.length/2, hw=k.track/2;
    const elev=(side,fwd)=>{const p=point(v,side,fwd);return World.height(p[0],p[1]);};
    const fl=elev(-hw,hl),fr=elev(hw,hl),rl=elev(-hw,-hl),rr=elev(hw,-hl);
    return [(fl+fr+rl+rr)/4, -Math.atan2((fl+fr-rl-rr)/2,k.length), Math.atan2((fr+rr-fl-rl)/2,k.track)];
  }
  function ground(v,dt,snap=false) {
    const plane=contactPlane(v), k=snap?1:1-Math.exp(-9.5*dt);
    v.y=mix(v.y,plane[0],k);
    const pitch=clamp(plane[1],-.47,.47),roll=clamp(plane[2],-.44,.44);
    v.slopePitch=pitch;v.slopeRoll=roll;
    v.tipRoll=smooth(v.tipRoll||0,v.tipped?v.tipTarget:0,3,dt);
    const bodyTravel=v.type==='exc'?0:1;
    v.pitch=mix(v.pitch,pitch+bodyTravel*v.dynamicPitch,k);
    v.roll=mix(v.roll,roll+bodyTravel*v.dynamicRoll+v.tipRoll,k);
  }
  function syncBody(v) {
    const root=v.model.root;
    root.p[0]=v.x;root.p[1]=v.y;root.p[2]=v.z;
    root.r[0]=v.pitch;root.r[1]=v.heading;root.r[2]=v.roll;
  }
  function pose(v) {
    syncBody(v); Machines.pose(v.model,v);
  }
  function cleanControls(v) {
    v.axes={lx:0,ly:0,rx:0,ry:0};v.engine=0;v.rpm=0;v.dynamicPitch=0;v.dynamicRoll=0;
    v.yawRate=0;v.emission=0;v.steer=0;v.speed=0;v.grading=0;
    v.lat=0;v.tipRoll=0;v.tipTarget=0;v.tipped=false;v.tipT=0;v.resist=0;v.chart=0;v.slopePitch=0;v.slopeRoll=0;
  }
  function make(type,parent) {
    const k=info[type];
    const v={type,model:Machines.create(type,parent),x:k.x,z:k.z,y:0,heading:k.heading,pitch:0,roll:0,
      running:false,occupied:false,fuel:72,oil:8,dieselCargo:0,oilCargo:0,
      flow:1,frontFlow:1,rearFlow:1,load:0,capacity:k.capacity,frontLoad:0,rearLoad:0,boom:.52,stick:.65,curl:.13,blade:.57,
      bed:0,frontLift:.05,frontCurl:.10,slew:0,bladeAngle:.05,tool:type==='back'?'front':type==='exc'?'bucket':type==='truck'?'bed':'blade',
      wheelRoll:0,leftTravel:0,rightTravel:0,stabilizers:0,volume:{dug:0,received:0,delivered:0,graded:0}};
    cleanControls(v);ground(v,step,true);pose(v);
    constrainGround(v);constrainGround(v);
    return v;
  }
  function init(parent) {
    clock=0;accumulator=0;gradeCells=new Set();history={dug:0,cut:0,loaded:0,delivered:0,graded:0};pieces=[];
    fleet=types.map(t=>make(t,parent));selected=fleet[0];
    for(let i=0;i<48;i++){
      const n=G.sphere(parent,[0,0,0],[1,1,1],soilTones[i%soilTones.length],5);
      n.visible=false;pieces.push({node:n,on:false});
    }
    return selected;
  }
  function select(type) {
    const v=fleet.find(m=>m.type===type);
    if(!v)return selected;
    if(selected && selected!==v){selected.axes={lx:0,ly:0,rx:0,ry:0};selected.engine=0;selected.emission=0;}
    selected=v;return v;
  }
  function toggleTool() {
    const v=selected;
    if(!v||!v.running||v.type!=='back'||Math.abs(v.speed)>.6)return false;
    v[v.tool+'Flow']=v.flow;v[v.tool+'Load']=v.load; v.tool=v.tool==='front'?'rear':'front';
    v.capacity=v.tool==='front'?info.back.capacity:.38;v.load=v[v.tool+'Load'];v.flow=v[v.tool+'Flow'];
    v.axes={lx:0,ly:0,rx:0,ry:0};v.emission=0;pose(v);return true;
  }
  function blocked(v,x,z,h) {
    const k=info[v.type],si=Math.sin(h),co=Math.cos(h);
    // Three footprint samples preserve fore/aft overhang through turns.
    for(const at of [k.tail,0,k.nose]){
      const px=x+si*at,pz=z+co*at;
      if(World.collides(px,pz,k.radius))return true;
      for(const other of fleet){
        if(other===v)continue;
        const o=info[other.type],p=local(other,px,pz), nearest=clamp(p[1],o.tail,o.nose);
        if(length(p[0],p[1]-nearest)<(k.radius+o.radius)*.91)return true;
      }
    }
    return false;
  }
  function drive(v,dt,input,operated) {
    const k=info[v.type],P=phys[v.type],tracked=v.type==='exc';
    if(v.tipped){operated=false;if(v.running)stop(v);}
    const turn=operated?-input.turn:0;
    const rearLocked=v.type==='back'&&(v.tool==='rear'||v.stabilizers>.12);
    const throttle=operated&&!rearLocked?input.drive:0;
    const brake=input.brake||!operated||rearLocked;
    const loadRatio=v.capacity?v.load/v.capacity:0,mr=P.m/mass(v);
    const sp=v.slopePitch||0,sr=v.slopeRoll||0;
    // Dinâmica longitudinal: tração limitada por mu·g·cosθ, gravidade ao longo da rampa, potência/peso.
    const soil = World.soil ? World.soil(v.x,v.z) : {basin:0,cover:0};
    const mud = wet * soil.basin;
    v.mud = mud; v.grass = soil.cover;
    const sand=soil.sand||0, gravel=soil.gravel||0;
    const drag=mud*(tracked?.15:.34)+sand*(tracked?.10:.26)+gravel*.065;
    v.surface=soil;
    const mu=P.mu*(1-.4*wet-.20*mud-.07*soil.cover-.12*sand-.08*gravel),tr=mu*G9*Math.cos(sp),grav=G9*Math.sin(sp); // grav>0: ladeira abaixo à frente
    const hold=Math.min(tr,G9*P.grade*(.5+.5*mr)/Math.hypot(1,P.grade));
    const climb=throttle*grav<0?Math.min(1,Math.abs(grav)/hold):0;
    const vmax=(throttle>=0?k.drive:k.reverse)*(1-.15*loadRatio)*(v.type==='truck'?1-.75*v.bed:1)*(1-.55*climb)*(1-drag);
    const previousSpeed=v.speed,slide=Math.abs(grav)>tr*.98;
    if(brake){
      // Freio retém até o atrito estático; acima disso a máquina escorrega com atrito cinético.
      if(slide)v.speed+=(grav-Math.sign(grav)*tr*.9)*dt;
      else v.speed=approach(v.speed,0,Math.min(k.stop*(.55+.45*mr),tr)*dt);
    } else if(Math.abs(throttle)>.025){
      const reversing=v.speed*throttle<-.06;
      const eng=Math.min(tr,reversing?k.stop:k.accel*mr*(1-drag)+(throttle*grav<0?Math.min(Math.abs(grav),hold):0));
      const need=(throttle*vmax-v.speed)/dt-grav;
      v.speed=clamp(v.speed+(clamp(need,-eng,eng)+grav)*dt,-k.reverse*1.07,k.drive*1.08);
    } else {
      const rollRes=(tracked?.92:.45)+mud*(tracked?.45:1.10)+sand*.80+gravel*.22+v.speed*v.speed*.022;
      v.speed+=(tracked?(slide?grav-Math.sign(grav)*tr*.9:0):grav)*dt;
      v.speed=approach(v.speed,0,rollRes*dt);
    }
    v.steer=smooth(v.steer,turn*k.steering/(1+.02*v.speed*v.speed),6,dt);
    let desiredYaw=brake?0:tracked?turn*(.80-.12*Math.abs(v.speed)):Math.tan(v.steer)*v.speed/k.length;
    // Limite de aderência lateral (subesterço): a curva não passa de ~1,5·mu·g.
    const grip=mu*G9*Math.cos(sr);
    if(!tracked){const cap=grip*1.5/Math.max(.5,Math.abs(v.speed));desiredYaw=clamp(desiredYaw,-cap,cap);}
    v.yawRate=smooth(v.yawRate,desiredYaw,tracked?5:8,dt);
    if(tracked && operated && input.trackControl && !brake){
      // Local +X is the operator's left. Integrate the two tread speeds independently.
      const target=side=>input[side]*(input[side]>=0?k.drive:k.reverse)*(1-drag);
      const l=target('leftTrack'),r=target('rightTrack');
      // Opposite full commands have equal magnitudes for a pivot about the centre.
      const gain=l*r<0?Math.min(k.drive,k.reverse)*(1-drag):0;
      v.trackL=approach(v.trackL??0,gain?input.leftTrack*gain:l,dt*2.2*(1-drag));
      v.trackR=approach(v.trackR??0,gain?input.rightTrack*gain:r,dt*2.2*(1-drag));
      v.speed=(v.trackL+v.trackR)/2;v.yawRate=(v.trackR-v.trackL)/2.18;
    } else if(tracked){v.trackL=v.speed-v.yawRate*1.09;v.trackR=v.speed+v.yawRate*1.09;}
    // Derrapagem: o excesso de aceleração centrípeta e a rampa lateral viram deslizamento lateral (+ = esquerda).
    const ac=v.speed*v.yawRate;
    if(!tracked){
      const ex=Math.abs(ac)>grip?ac-Math.sign(ac)*grip:0,side=G9*Math.sin(sr);
      v.lat-=ex*dt;
      if(Math.abs(side)>grip*.98)v.lat-=Math.sign(side)*(Math.abs(side)-grip*.9)*dt;
      v.lat=approach(v.lat,0,grip*.12*dt);
    }
    const deltaH=dt*v.yawRate,travel=v.speed*dt,drift=v.lat*dt;
    const oldHeading=v.heading,oldX=v.x,oldZ=v.z;
    const heading=oldHeading+deltaH,hMid=oldHeading+deltaH/2;
    const x=v.x+Math.sin(hMid)*travel+Math.cos(hMid)*drift,z=v.z+Math.cos(hMid)*travel-Math.sin(hMid)*drift;
    if((Math.abs(travel)+Math.abs(deltaH)+Math.abs(drift))>1e-6){
      if(!blocked(v,x,z,heading)){
        v.x=x;v.z=z;v.heading=heading;
        v.wheelRoll=(v.wheelRoll+travel/(tracked?.41:v.type==='truck'?.58:.66))%(Math.PI*2);
      } else {
        // A glancing collision can still permit a pivot or a straight escape.
        if(Math.abs(deltaH)>1e-6&&!blocked(v,v.x,v.z,heading))v.heading=heading;
        v.speed=0;v.yawRate=0;v.trackL=0;v.trackR=0;v.lat=0;
      }
    }
    if(tracked){
      const advance=(v.x-oldX)*Math.sin(hMid)+(v.z-oldZ)*Math.cos(hMid);
      const differential=(v.heading-oldHeading)*1.09;
      v.leftTravel+=advance-differential;v.rightTravel+=advance+differential;
    }
    if(Math.abs(v.heading)>Math.PI)v.heading=Math.atan2(Math.sin(v.heading),Math.cos(v.heading));
    // Transferência de peso: arfagem/rolagem proporcionais a a·h/(g·L) e a_c·h/(g·bitola).
    const along=(v.speed-previousSpeed)/dt;
    const cg=P.h+(v.type==='truck'?.35*loadRatio+v.bed*(.35+.55*loadRatio):0);
    v.dynamicPitch=smooth(v.dynamicPitch,clamp(-along*cg/(G9*k.length)*.8,-.09,.09),5,dt);
    if(v.type==='bike')v.dynamicRoll=smooth(v.dynamicRoll,clamp(-Math.atan(ac/G9),-.85,.85),7,dt); // inclinação de equilíbrio
    else{
      v.dynamicRoll=smooth(v.dynamicRoll,clamp(ac*cg/(G9*k.track)*.5,-.12,.12),5,dt);
      // Tombamento: força lateral efetiva (curva + rampa) acima de bitola/(2·h) por mais de 0,3 s.
      const out=ac/G9+Math.tan(sr);
      v.tipT=Math.abs(out)>k.track/(2*cg)?v.tipT+dt:Math.max(0,v.tipT-2*dt);
      if(v.tipT>.3&&!v.tipped){v.tipped=true;v.tipTarget=Math.sign(out)*1.45;v.speed*=.3;}
    }
    return Math.abs(throttle);
  }
  function hydraulics(v,dt,input) {
    const a=v.axes;
    const cv=(u)=>Math.abs(u)<.045?0:u;
    a.lx=smooth(a.lx,cv(input.mode==='drive'?0:input.leftX),10,dt);
    a.ly=smooth(a.ly,cv(input.mode==='drive'?0:input.leftY),10,dt);
    a.rx=smooth(a.rx,cv(input.rightX),12,dt);a.ry=smooth(a.ry,cv(input.rightY),12,dt);
    const limit=(value,rate)=>clamp(value+rate*dt,0,1);
    if(v.type==='back')v.stabilizers=approach(v.stabilizers,v.tool==='rear'?1:0,dt*.75);
    if(v.type==='exc'||(v.type==='back'&&v.tool==='rear'&&v.stabilizers>.82)){
      // Curva de carga: o momento da carga no alcance (t·m) contra o momento estabilizante limita o içamento.
      const k=info[v.type],tp=toolTip(v),reach=length(tp[0]-v.x,tp[2]-v.z);
      const lim=phys[v.type].m*(k.track/2+(v.type==='back'?v.stabilizers*.6:0))*.8;
      v.chart=clamp((v.load*SOIL+.6)*reach/lim,0,1.5);
      const lift=clamp((1-v.chart)/.35,0,1);
      v.boom=limit(v.boom,-a.ry*.40*(a.ry<0?lift:1));v.stick=limit(v.stick,a.ly*.49);
      v.curl=limit(v.curl,-a.rx*.79*(1-v.resist));
      if(v.type==='exc')v.slew=(v.slew+a.lx*dt*1.01)%(Math.PI*2);
      else v.slew=clamp(v.slew+a.lx*dt*.88,-1.25,1.25);
    } else if(v.type==='back'&&v.tool==='front'){
      v.frontLift=limit(v.frontLift,-a.ry*.47*(a.ry<0?1-.5*v.resist:1));v.frontCurl=limit(v.frontCurl,-a.rx*.84*(1-.6*v.resist));
    } else if(v.type==='grader'){
      v.blade=limit(v.blade,-a.ry*.64);v.bladeAngle=clamp(v.bladeAngle+a.rx*dt*.74,-.88,.88);
    } else if(v.type==='truck'){
      v.bed=limit(v.bed,-a.ry*.37);
    }
    return Math.max(Math.abs(a.rx),Math.abs(a.ry),Math.abs(a.lx),Math.abs(a.ly));
  }
  function toolTip(v) {const p=Machines.tip(v.model);return [p[0],p[1],p[2]];}
  function constrainGround(v) {
    let p=toolTip(v);
    if(['truck','bike','pickup'].includes(v.type))return p;
    if(v.type==='grader'){
      // Commanded height is retained as the blade floats over local high spots.
      const rise=World.height(p[0],p[2])-p[1]-.12;
      if(rise>0){v.model.bladeGroup.p[1]+=rise;return toolTip(v);}
      return p;
    }
    const key=v.type==='back'&&v.tool==='front'?'frontLift':'boom';
    const allowance=.26;
    for(let i=0;i<2;i++){
      const pen=World.height(p[0],p[2])-p[1]-allowance;
      if(pen<=.025||v[key]>=.999)break;
      const scale=key==='frontLift'?.34:.17;
      v[key]=clamp(v[key]+pen*scale,0,1);pose(v);p=toolTip(v);
    }
    return p;
  }
  function inTruck(truck,x,z,margin=0) {
    const p=local(truck,x,z);
    return Math.abs(p[0])<=1.07+margin && p[1]>=-2.60-margin && p[1]<=1.17+margin;
  }
  function updateBucket(v,dt,p,before){
    const front=v.type==='back'&&v.tool==='front',a=v.axes;
    v.resist=0;
    if(v.type==='back'&&!front&&v.stabilizers<.82)return;
    const curl=front?v.frontCurl:v.curl;
    // Lowering, crowding the dipper, curling or driving a low loader into a pile
    // can produce a bite. Command alone cannot remove a stationary patch.
    const cutting=a.rx<.04&&curl<.985&&(a.rx<-.035||a.ry>.035||
      (front?v.speed>.08:Math.abs(a.ly)>.035));
    let collected=0;
    if(cutting&&v.load<v.capacity-.00001){
      const bite=World.scoop(before,Machines.bucketEdge(v.model),v.capacity-v.load,wet);
      collected=bite.volume;
      if(collected>0){
        v.flow=(v.flow*v.load+collected*bite.flow)/(v.load+collected);
        v.load+=collected;v.resist=clamp(bite.resistance+.15*v.load/v.capacity,0,.8);
        v.volume.dug+=collected;history.dug+=collected;history.cut=history.dug;
      }
    }
    // Material stays in the curled bucket and starts spilling as its mouth opens.
    if(v.load>.00001&&curl<.60&&collected===0&&(a.rx>.035||curl<.16&&!cutting)){
      const slope=clamp((.60-curl)/.36,0,1);
      if(slope>.02)spill(v,dt,p,(front?1.55:1.45)*slope,front?0:v.slew,1);
    } else v.emission=0;
    if(v.type==='back'){v[v.tool+'Load']=v.load;v[v.tool+'Flow']=v.flow;}
  }
  function spill(v,dt,p,rate,extraAngle,sign) {
    v.emission+=dt;
    if(v.emission<.085)return;
    const free=pieces.find(o=>!o.on);if(!free){v.emission=Math.min(.15,v.emission);return;}
    const amount=Math.min(v.load,rate*v.flow*v.emission);v.emission=0;
    if(amount<.000001)return;
    const angle=v.heading+extraAngle+(v.type==='back'&&v.tool==='rear'?Math.PI:0);
    const spread=(next()-.5)*(v.type==='truck'?1.12:.42);
    const forward=sign*(v.type==='truck'?1.0+next()*.35:.32+next()*.38);
    const dx=Math.sin(angle),dz=Math.cos(angle);
    free.flow=v.flow;free.on=true;free.source=v.type;free.tool=v.tool;free.volume=amount;
    free.x=p[0]+dz*spread;free.y=p[1]+.09;free.z=p[2]-dx*spread;
    free.vx=dx*forward+Math.sin(v.heading)*v.speed;free.vz=dz*forward+Math.cos(v.heading)*v.speed;free.vy=-.56;
    free.life=0;free.node.visible=true;
    const size=Math.cbrt(amount)*.57;
    free.node.s[0]=size*1.18;free.node.s[1]=size*.91;free.node.s[2]=size;
    free.node.p[0]=free.x;free.node.p[1]=free.y;free.node.p[2]=free.z;
    v.load=Math.max(0,v.load-amount);
  }
  function updateGrader(v,dx,dz){
    // The blade follows the posed carriage, including chassis pitch and roll.
    // A parked or blocked machine has no swept area, even with throttle applied.
    if(v.blade>.48||v.tipped||Math.hypot(dx,dz)<.0001)return;
    const [left,right]=Machines.cuttingEdge(v.model);
    const moved=World.sweepBlade(left,right,dx,dz,(x,z,volume)=>{
      Obra.measure(x,z,volume);
      const cell=workCell(x,z);if(cell!==null)gradeCells.add(cell);
    });
    v.volume.graded+=moved;history.graded=gradeCells.size;
  }
  function land(item,truck) {
    const b=World.bounds;
    let x=item.x,z=item.z;
    if(item.source!=='truck'&&inTruck(truck,x,z)){
      const p=local(truck,x,z);
      [x,z]=point(truck,p[0]<0?-1.7:1.7,p[1]);
    }
    x=clamp(x,b.minX+2,b.maxX-2);z=clamp(z,b.minZ+2,b.maxZ-2);
    const r=(item.source==='truck'?1.45:1.2)*(item.flow||1);
    function put(px,pz){
      const amount=Math.min(item.volume,World.deposit(px,pz,r,item.volume)||0);
      item.volume=Math.max(0,item.volume-amount);
      if(item.source==='truck'&&zone('dump',px,pz)){
        history.delivered+=amount;truck.volume.delivered+=amount;
      }
    }
    put(x,z);
    // Spread excess beside a saturated heap; never put it back into a full bucket.
    for(let ring=1;item.volume>.000001&&ring<=4;ring++){
      for(let side=0;side<8&&item.volume>.000001;side++){
        const a=side*Math.PI/4;
        put(clamp(x+ring*2*Math.cos(a),b.minX+2,b.maxX-2),
            clamp(z+ring*2*Math.sin(a),b.minZ+2,b.maxZ-2));
      }
    }
    if(item.volume<=.000001)return true;
    item.x=clamp(x+1.5,b.minX+2,b.maxX-2);item.z=z;
    item.y=World.height(item.x,z)+.06;item.vx=item.vy=item.vz=0;item.life=0;
    return false;
  }
  function particles(dt,truck) {
    for(const o of pieces){
      if(!o.on)continue;
      o.life+=dt;const before=o.y;
      o.vy-=9.81*dt;o.x+=o.vx*dt;o.z+=o.vz*dt;o.y+=o.vy*dt;
      let done=false;
      if(o.source!=='truck'&&truck.bed<.22&&inTruck(truck,o.x,o.z,.08)){
        // A parcel must clear the side rail before falling into the body.
        // A small tolerance covers the toothed lip of a bucket already over the bed.
        const lip=truck.y+2.66;
        if(before>=lip-.20&&o.y<=lip+.04&&o.vy<0){
          const received=Math.min(o.volume,Math.max(0,truck.capacity-truck.load));
          if(received>0)truck.flow=(truck.flow*truck.load+(o.flow||1)*received)/(truck.load+received);
          truck.load+=received;truck.volume.received+=received;history.loaded+=received;
          o.volume-=received;done=o.volume<.000001;
          if(!done&&received>0)done=land(o,truck);
        }
      }
      if(!done&&(o.y<=World.height(o.x,o.z)+.04||o.life>6))done=land(o,truck);
      if(done){o.on=false;o.node.visible=false;continue;}
      o.node.p[0]=o.x;o.node.p[1]=o.y;o.node.p[2]=o.z;o.node.r[0]+=dt*2.9;o.node.r[2]+=dt*1.1;
    }
  }
  function frame(dt,input) {
    clock+=dt;
    const v=selected,truck=fleet.find(c=>c.type==='truck');
    // Unattended vehicles coast down under their service brake; attachments stay put.
    for(const other of fleet){
      if(other===v)continue;
      const px=other.x,pz=other.z,ph=other.heading;
      drive(other,dt,{},false);
      ground(other,dt);
      const moved=other.x!==px||other.z!==pz||other.heading!==ph||Math.abs(other.tipRoll)>.002;
      if(moved||Math.abs(other.speed)>.001)pose(other);else syncBody(other);
    }
    const priorLoad=v.load,priorTruckLoad=truck.load;
    const running=v.running&&v.occupied;
    const before=running&&(v.type==='exc'||v.type==='back')?Machines.bucketEdge(v.model):null;
    const oldX=v.x,oldZ=v.z;
    const throttle=drive(v,dt,input,running),power=running?hydraulics(v,dt,input):0;
    ground(v,dt);pose(v);
    const p=running?constrainGround(v):toolTip(v);
    if(running&&(v.type==='exc'||v.type==='back'))updateBucket(v,dt,p,before);
    else if(running&&v.type==='grader')updateGrader(v,v.x-oldX,v.z-oldZ);
    if(truck.running&&truck.bed>.41&&truck.load>.00001)spill(truck,dt,truck===v?p:toolTip(truck),Math.min(2.8,(truck.bed-.41)*6.5),0,-1);
    particles(dt,truck);
    v.engine=Math.max(throttle,power*.86,Math.min(1,Math.abs(v.speed)/info[v.type].drive));
    v.rpm=running?smooth(v.rpm,780+v.engine*(v.type==='truck'?1330:1060),3.8,dt):0;
    if(running && v.type!=='bike'){
      v.fuel=Math.max(0,v.fuel-dt*(.004+.029*v.engine));v.oil=Math.max(0,v.oil-dt*(.00015+.0003*v.engine));
      if(!v.fuel||!v.oil)stop(v);
    }
    if(Math.abs(v.load-priorLoad)>.00001)pose(v);
    if(truck!==v&&Math.abs(truck.load-priorTruckLoad)>.00001)pose(truck);
  }
  function update(dt,input={}) {
    if(!selected||!Number.isFinite(dt)||dt<=0)return;
    const axis=k=>Number.isFinite(input[k])?clamp(input[k],-1,1):0;
    const clean={drive:axis('drive'),turn:axis('turn'),leftX:axis('leftX'),leftY:axis('leftY'),rightX:axis('rightX'),rightY:axis('rightY'),
      leftTrack:axis('leftTrack'),rightTrack:axis('rightTrack'),trackControl:!!input.trackControl,brake:!!input.brake,mode:input.mode};
    accumulator+=Math.min(dt,.15);
    while(accumulator>=step-1e-9){frame(step,clean);accumulator-=step;}
    if(accumulator<0)accumulator=0;
  }
  function destination(v,name) {
    const dest=World.zones[name],p=local(v,dest.x,dest.z),distance=Math.round(length(p[0],p[1]));
    if(distance<2)return 'aqui';
    const ang=Math.atan2(p[0],p[1])/rad;
    const words=Math.abs(ang)<30?'à frente':Math.abs(ang)>150?'atrás':ang>0?'à esquerda':'à direita';
    return distance+' m '+words;
  }
  function objective() {
    const v=selected,truck=fleet.find(c=>c.type==='truck');
    if(!v)return {stage:0,progress:0,objective:'Escave 0,50 m³ de terra',hint:'Escolha a escavadeira ou a retroescavadeira.'};
    const tip=toolTip(v),curl=v.type==='back'&&v.tool==='front'?v.frontCurl:v.curl;
    if(history.dug+.001<goals.dig){
      let hint;
      if(v.type!=='exc'&&v.type!=='back')hint='Selecione a escavadeira ou a retroescavadeira e escolha onde escavar.';
      else if(tip[1]>World.height(tip[0],tip[2])+.32)hint='Abaixe os dentes da concha até tocar o terreno.';
      else if(curl>.93)hint='Abra a concha, encoste os dentes na terra e volte a fechá-la.';
      else hint='Feche a concha com os dentes na terra para colher o material.';
      return {stage:0,progress:clamp(history.dug/goals.dig,0,1),objective:'Escave 0,50 m³ de terra',hint};
    }
    if(history.delivered+.001<goals.deliver){
      let hint;
      if(v.type==='truck'){
        if(!v.load)hint='Na escavadeira, erga a concha, gire sobre a carroceria e abra.';
        else if(zone('dump',tip[0],tip[2]))hint='Com a traseira na área de descarga, levante a caçamba do caminhão.';
        else hint='Dirija até a descarga ('+destination(v,'dump')+') e posicione a traseira na faixa.';
      } else if(truck.load>=goals.deliver-history.delivered-.005)hint='O caminhão tem carga. Selecione-o na garagem e siga até a descarga.';
      else if(v.load>.01){
        if(inTruck(truck,tip[0],tip[2],.18))hint='Abra a concha sobre a carroceria para transferir a terra.';
        else hint='Erga a lança, ajuste o alcance e gire sobre a carroceria antes de abrir.';
      }else hint='Carregue a concha no solo e despeje sobre a carroceria do caminhão.';
      return {stage:1,progress:clamp(history.delivered/goals.deliver,0,1),objective:'Entregue 0,45 m³ com o basculante',hint};
    }
    if(history.graded<goals.grade){
      let hint;
      if(v.type!=='grader')hint='Selecione a motoniveladora na garagem.';
      else if(v.blade<.04&&tip[1]>World.height(tip[0],tip[2])+.24)hint='Avance devagar até a lâmina alcançar a próxima irregularidade do solo.';
      else if(tip[1]>World.height(tip[0],tip[2])+.24)hint='Abaixe a lâmina até tocar o terreno que quer nivelar.';
      else hint='Avance devagar com a lâmina no solo e cubra uma faixa nova.';
      return {stage:2,progress:clamp(history.graded/goals.grade,0,1),objective:'Nivele 12 m² de terreno',hint};
    }
    return {stage:3,progress:1,objective:'Serviço concluído',hint:'O canteiro continua aberto para operação livre.'};
  }
  const ranges={x:[-512,512],z:[-512,512],heading:[-10000,10000],speed:[-12,12],
    wheelRoll:[-100,100],boom:[0,1],stick:[0,1],curl:[0,1],blade:[0,1],bed:[0,1],frontLift:[0,1],
    frontCurl:[0,1],slew:[-7,7],bladeAngle:[-.88,.88],stabilizers:[0,1]};
  const numeric=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
  const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
  function snapshot(){
    return {version:1,selected:selected.type,history:{...history},cells:Array.from(gradeCells),machines:fleet.map(v=>({...pick(v,Object.keys(ranges)),type:v.type,flow:v.flow,frontFlow:v.frontFlow,rearFlow:v.rearFlow,fuel:v.fuel,oil:v.oil,dieselCargo:v.dieselCargo,oilCargo:v.oilCargo,tool:v.tool,load:v.load,frontLoad:v.frontLoad,rearLoad:v.rearLoad,leftTravel:v.leftTravel,rightTravel:v.rightTravel,volume:{...v.volume}})),
      pieces:pieces.filter(o=>o.on).map(o=>pick(o,['source','tool','flow','volume','x','y','z','vx','vy','vz','life']))};
  }
  function restore(data){
    const {minX,maxX,minZ,maxZ}=World.bounds;
    if(!data||data.version!==1||!types.includes(data.selected)||!Array.isArray(data.machines)||![4,6].includes(data.machines.length)||!Array.isArray(data.cells)||data.cells.length>(maxX-minX)*(maxZ-minZ)||!Array.isArray(data.pieces)||data.pieces.length>pieces.length)return false;
    if(!data.history||['dug','cut','loaded','delivered','graded'].some(k=>!numeric(data.history[k],0,1e8)))return false;
    if(data.cells.some(cell=>{
      if(typeof cell!=='string'||!/^[-]?\d{1,3},[-]?\d{1,3}$/.test(cell))return true;
      const [x,z]=cell.split(',').map(Number);
      return workCell(x,z)!==cell;
    }))return false;
    for(const type of (data.machines.length===4?types.slice(0,4):types)){
      const d=data.machines.find(o=>o&&o.type===type);
      if(!d||!d.volume||Object.entries(ranges).some(([k,r])=>!numeric(d[k],...r)))return false;
      const cap=type==='back'&&d.tool==='rear'?.38:info[type].capacity;
      if(!numeric(d.load,0,cap+.005)||!numeric(d.frontLoad,0,.96)||!numeric(d.rearLoad,0,.39))return false;
      if(type==='back'&&!['front','rear'].includes(d.tool))return false;
      for(const key of ['leftTravel','rightTravel'])if(d[key]!==undefined&&!numeric(d[key],-1e8,1e8))return false;
      if(['dug','received','delivered','graded'].some(k=>!numeric(d.volume[k],0,1e8)))return false;
    }
    for(const o of data.pieces){
      if(!o||!types.includes(o.source)||!numeric(o.volume,0,1)||Object.keys({x:1,y:1,z:1}).some(k=>!numeric(o[k],-600,600))
        ||['vx','vy','vz'].some(k=>!numeric(o[k],-100,100))||!numeric(o.life,0,6))return false;
    }
    for(const v of fleet){
      const d=data.machines.find(o=>o.type===v.type);
      if(!d)continue;
      cleanControls(v);
      for(const key of ['flow','frontFlow','rearFlow'])v[key]=numeric(d[key],.5,1.5)?d[key]:1;
      Object.assign(v,pick(d,Object.keys(ranges)),pick(d,['load','frontLoad','rearLoad']));
      for(const [key,max] of [['fuel',100],['oil',10],['dieselCargo',160],['oilCargo',20]]){
        if(numeric(d[key],0,max))v[key]=d[key];
      }
      v.speed=0;v.running=false;v.occupied=false;
      v.leftTravel=d.leftTravel??d.wheelRoll*.41;v.rightTravel=d.rightTravel??d.wheelRoll*.41;
      if(v.type==='back')v.tool=d.tool;
      v.capacity=v.type==='back'&&v.tool==='rear'?.38:info[v.type].capacity;v.volume={...d.volume};
      ground(v,step,true);pose(v);
    }
    pieces.forEach((p,i)=>{
      const d=data.pieces[i];p.on=!!d;p.node.visible=!!d;
      if(!d)return;
      Object.assign(p,pick(d,['source','tool','flow','volume','x','y','z','vx','vy','vz','life']));
      p.flow=numeric(d.flow,.5,1.5)?d.flow:1;
      const size=Math.cbrt(d.volume)*.57;
      p.node.s[0]=size*1.18;p.node.s[1]=size*.91;p.node.s[2]=size;
      p.node.p[0]=p.x;p.node.p[1]=p.y;p.node.p[2]=p.z;
    });
    history={...data.history};
    // Older versions recorded all bucket loads in dug but only marked cut inside the starting pit.
    history.dug=Math.max(history.dug,history.cut);history.cut=history.dug;
    gradeCells=new Set(data.cells);history.graded=gradeCells.size;
    accumulator=0;selected=fleet.find(v=>v.type===data.selected);return true;
  }
  function stop(v){
    v.running=false;v.rpm=v.engine=0;v.axes={lx:0,ly:0,rx:0,ry:0};
  }
  function occupy(v,occupied){
    fleet.forEach(o=>{if(o.occupied||o===v){stop(o);o.occupied=false;pose(o);}});
    v.occupied=occupied;pose(v);
  }
  function ignition(){
    const v=selected;
    if(!v.occupied)return false;
    if(v.tipped){v.tipped=false;v.tipT=0;v.lat=0;v.speed=0;return false;} // endireita a máquina
    if(v.running)stop(v);
    else if(v.fuel>0&&v.oil>0)v.running=true;
    return v.running;
  }
  function service(){
    const v=selected;
    if(v.type!=='pickup'||!v.occupied||Math.abs(v.speed)>.15)return 'Estacione a picape para atender.';
    if(zone('depot',v.x,v.z)){
      v.dieselCargo=160;v.oilCargo=20;v.fuel=100;v.oil=10;
      return 'Depósito • picape carregada com 160 L de diesel e 20 L de óleo.';
    }
    const nearby=fleet.filter(o=>o!==v&&o.type!=='bike'&&!o.running&&Math.abs(o.speed)<.15)
      .map(o=>({o,d:length(v.x-o.x,v.z-o.z)})).filter(m=>m.d<=6.5).sort((a,b)=>a.d-b.d)[0];
    if(!nearby)return 'Estacione a até 6,5 m de uma máquina desligada.';
    const o=nearby.o,d=Math.min(100-o.fuel,v.dieselCargo),oil=Math.min(10-o.oil,v.oilCargo);
    o.fuel+=d;o.oil+=oil;v.dieselCargo-=d;v.oilCargo-=oil;
    return d+oil>.0001?'Transferidos '+d.toFixed(1)+' L de diesel e '+oil.toFixed(1)+' L de óleo.':'Confira a carga da picape e os níveis da máquina.';
  }
  window.Sim={setWet:w=>{wet=clamp(+w||0,0,1)},wet:()=>wet,occupy,ignition,service,init,select,update,active:()=>selected,all:()=>fleet,objective,toggleTool,stats:()=>({...history}),tip:()=>toolTip(selected),snapshot,restore};
})();
