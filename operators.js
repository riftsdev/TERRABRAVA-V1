/* GLB player for the two supplied skinned operators. Share the decoded rig,
   animation tracks and texture data between the fitting room and the game. */
window.OperatorFiles={};
window.Operators=(()=>{
  'use strict';
  const catalog={Masculino:1.78,Feminino:1.68},cache=new Map();
  const storage='terrabrava.operador',idle='standing_relax';
  let selected='Masculino',active=null;
  try{const name=localStorage.getItem(storage);if(Object.hasOwn(catalog,name))selected=name;}catch(_){}
  const mat=()=>new Float32Array(16);
  function multiply(out,a,b){
    for(let j=0;j<16;j+=4)for(let i=0;i<4;i++)
      out[j+i]=a[i]*b[j]+a[4+i]*b[j+1]+a[8+i]*b[j+2]+a[12+i]*b[j+3];
  }
  function compose(m,p){
    const [tx,ty,tz,x,y,z,w,sx,sy,sz]=p;
    m.set([(1-2*(y*y+z*z))*sx,2*(x*y+w*z)*sx,2*(x*z-w*y)*sx,0,
      2*(x*y-w*z)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+w*x)*sy,0,
      2*(x*z+w*y)*sz,2*(y*z-w*x)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1]);
  }
  function rotation(out,k,a,i,b,j,t){
    let dot=a[i]*b[j]+a[i+1]*b[j+1]+a[i+2]*b[j+2]+a[i+3]*b[j+3];
    const sign=dot<0?-1:1;dot=Math.min(1,Math.abs(dot));
    let u=1-t,v=t;
    if(dot<.9995){const theta=Math.acos(dot),inv=1/Math.sin(theta);u=Math.sin(u*theta)*inv;v=Math.sin(v*theta)*inv;}
    for(let n=0;n<4;n++)out[k+n]=a[i+n]*u+b[j+n]*v*sign;
  }
  async function bytes(name){
    const url='assets/operators/'+name+'(1)';
    if(location.protocol!=='file:'){
      const response=await fetch(url+'.glb');if(!response.ok)throw Error('GLB '+response.status);
      return response.arrayBuffer();
    }
    await new Promise((ok,fail)=>{const tag=document.createElement('script');tag.src=url+'.js';tag.onload=()=>{tag.remove();ok();};tag.onerror=fail;document.head.append(tag);});
    const raw=atob(OperatorFiles[name]);delete OperatorFiles[name];
    return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
  }
  async function texture(blob){
    const url=URL.createObjectURL(blob),img=new Image();
    try{img.src=url;await img.decode();
      const can=document.createElement('canvas'),scale=Math.min(1,1024/Math.max(img.width,img.height));
      can.width=Math.round(img.width*scale);can.height=Math.round(img.height*scale);
      const ctx=can.getContext('2d');ctx.drawImage(img,0,0,can.width,can.height);return can;
    }finally{URL.revokeObjectURL(url);}
  }
  async function load(name){
    const buf=await bytes(name),size=new DataView(buf).getUint32(12,true);
    const g=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,size))),bin=28+size;
    const types={5126:Float32Array,5123:Uint16Array,5121:Uint8Array};
    const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
    const views=g.accessors.map(a=>{const v=g.bufferViews[a.bufferView];
      return new types[a.componentType](buf,bin+(v.byteOffset||0)+(a.byteOffset||0),a.count*widths[a.type]);});
    const p=g.meshes[0].primitives[0],attr=p.attributes,skin=g.skins[0],material=g.materials[p.material];
    async function map(info){
      const img=g.images[g.textures[info.index].source],v=g.bufferViews[img.bufferView];
      return texture(new Blob([new Uint8Array(buf,bin+(v.byteOffset||0),v.byteLength)],{type:img.mimeType}));
    }
    const [albedo,normalMap,roughness]=await Promise.all([map(material.pbrMetallicRoughness.baseColorTexture),map(material.normalTexture),map(material.pbrMetallicRoughness.metallicRoughnessTexture)]);
    const bind=g.nodes.map(n=>new Float32Array([...(n.translation||[0,0,0]),...(n.rotation||[0,0,0,1]),...(n.scale||[1,1,1])]));
    const parents=g.nodes.map(()=>-1),order=[];
    function visit(i,par){parents[i]=par;order.push(i);for(const c of g.nodes[i].children||[])visit(c,i);}
    for(const i of g.scenes[g.scene].nodes)visit(i,-1);
    const clips={};
    for(const a of g.animations){
      const tracks=a.channels.map(c=>{const s=a.samplers[c.sampler],path=c.target.path;
        return {node:c.target.node,k:{translation:0,rotation:3,scale:7}[path],width:path==='rotation'?4:3,
          times:views[s.input],values:views[s.output],step:s.interpolation==='STEP'};});
      clips[a.name]={tracks,duration:Math.max(...tracks.map(t=>t.times[t.times.length-1]))};
    }
    const pos=views[attr.POSITION],bounds=g.accessors[attr.POSITION];
    return {name,bind,parents,order,clips,hand:g.nodes.findIndex(n=>n.name.endsWith(':RightHand')),finger:g.nodes.findIndex(n=>n.name.endsWith(':RightHandMiddle1')),hips:g.nodes.findIndex(n=>n.name.endsWith(':Hips')),joints:skin.joints,
      inverse:skin.joints.map((_,i)=>views[skin.inverseBindMatrices].subarray(i*16,i*16+16)),pos,
      norm:views[attr.NORMAL],uv:views[attr.TEXCOORD_0],bones:views[attr.JOINTS_0],weights:views[attr.WEIGHTS_0],
      ind:views[p.indices],albedo,normalMap,roughness,tex:albedo.getContext('2d').getImageData(0,0,albedo.width,albedo.height).data,
      scale:catalog[name]/(bounds.max[1]-bounds.min[1])};
  }
  function get(name){if(!cache.has(name))cache.set(name,load(name).catch(e=>{cache.delete(name);throw e;}));return cache.get(name);}
  function instance(r){
    const copy=()=>r.bind.map(p=>p.slice());
    return {r,pose:copy(),from:copy(),local:r.bind.map(mat),world:r.bind.map(mat),palette:r.joints.map(mat),
      points:new Float32Array(r.pos.length),normals:new Float32Array(r.pos.length),screen:new Float32Array(r.pos.length),
      clip:'',elapsed:0,blend:1,clock:1,revision:0};
  }
  function animate(a,name,dt,rate=1){
    const r=a.r,c=r.clips[name];
    if(a.clip!==name){for(let i=0;i<a.pose.length;i++)a.from[i].set(a.pose[i]);a.blend=a.clip?0:1;a.clip=name;a.elapsed=0;a.clock=1;}
    a.elapsed=(a.elapsed+dt*rate)%c.duration;a.blend=Math.min(1,a.blend+dt/.22);a.clock+=dt;
    if(a.clock<1/32 && a.revision)return;a.clock=0;
    for(const t of c.tracks){
      const keys=t.times,values=t.values,out=a.pose[t.node],w=t.width,k=t.k;
      let lo=0,hi=keys.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid]<=a.elapsed)lo=mid;else hi=mid;}
      if(a.elapsed>=keys[hi])lo=hi;
      const f=t.step||lo===hi?0:Math.max(0,(a.elapsed-keys[lo])/(keys[hi]-keys[lo]));
      if(k===3)rotation(out,k,values,lo*w,values,hi*w,f);
      else for(let j=0;j<w;j++)out[k+j]=values[lo*w+j]*(1-f)+values[hi*w+j]*f;
      if(t.node===r.hips && k===0){out[0]+=r.bind[t.node][0]-values[0];out[2]+=r.bind[t.node][2]-values[2];}
      if(a.blend<1){const f=a.blend*a.blend*(3-2*a.blend);
        if(k===3)rotation(out,k,a.from[t.node],k,out,k,f);
        else for(let j=0;j<w;j++)out[k+j]=a.from[t.node][k+j]*(1-f)+out[k+j]*f;
      }
    }
    for(const i of r.order){compose(a.local[i],a.pose[i]);const parent=r.parents[i];if(parent<0)a.world[i].set(a.local[i]);else multiply(a.world[i],a.world[parent],a.local[i]);}
    r.joints.forEach((node,j)=>multiply(a.palette[j],a.world[node],r.inverse[j]));
    for(let i=0,p=0;i<r.pos.length;i+=3,p+=4){
      const x=r.pos[i],y=r.pos[i+1],z=r.pos[i+2],nx=r.norm[i],ny=r.norm[i+1],nz=r.norm[i+2];
      let X=0,Y=0,Z=0,NX=0,NY=0,NZ=0;
      for(let j=p;j<p+4;j++){const w=r.weights[j];if(!w)continue;const m=a.palette[r.bones[j]];
        X+=w*(m[0]*x+m[4]*y+m[8]*z+m[12]);Y+=w*(m[1]*x+m[5]*y+m[9]*z+m[13]);Z+=w*(m[2]*x+m[6]*y+m[10]*z+m[14]);
        NX+=w*(m[0]*nx+m[4]*ny+m[8]*nz);NY+=w*(m[1]*nx+m[5]*ny+m[9]*nz);NZ+=w*(m[2]*nx+m[6]*ny+m[10]*nz);}
      a.points[i]=X*r.scale;a.points[i+1]=Y*r.scale;a.points[i+2]=Z*r.scale;
      a.normals[i]=NX;a.normals[i+1]=NY;a.normals[i+2]=NZ;
    }
    a.revision++;
  }
  async function select(name,save=false){const r=await get(name);active=instance(r);selected=name;if(save)try{localStorage.setItem(storage,name);}catch(_){}}
  // Software renderer shares the terrain depth buffer. UVs use reciprocal depth
  // interpolation so the original clothing atlas stays fixed to the mesh.
  function raster(a,m,project,frame,depth,width,height){
    const r=a.r,pts=a.points,s=a.screen,uv=r.uv,ids=r.ind,tex=r.tex,tw=r.albedo.width,th=r.albedo.height;
    for(let i=0;i<pts.length;i+=3){
      const x=pts[i],y=pts[i+1],z=pts[i+2];
      const v=project(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);
      s[i]=v[0];s[i+1]=v[1];s[i+2]=1/v[2];
    }
    for(let t=0;t<ids.length;t+=3){
      const A=ids[t],B=ids[t+1],C=ids[t+2],i=A*3,j=B*3,k=C*3;
      const ax=s[i],ay=s[i+1],bx=s[j],by=s[j+1],cx=s[k],cy=s[k+1],az=s[i+2],bz=s[j+2],cz=s[k+2];
      if(Math.min(az,bz,cz)<=0||Math.max(az,bz,cz)>12)continue;
      const det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(det)<.025)continue;
      const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
      const light=.86+.14*Math.max(-.5,a.normals[i+1]);
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/det,v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/det,w=1-u-v;
        if(u<0||v<0||w<0)continue;const d=u*az+v*bz+w*cz,index=x+y*width;if(depth[index]>=d)continue;
        const U=(uv[2*A]*u*az+uv[2*B]*v*bz+uv[2*C]*w*cz)/d,V=(uv[2*A+1]*u*az+uv[2*B+1]*v*bz+uv[2*C+1]*w*cz)/d;
        const p=4*(Math.min(tw-1,Math.max(0,U*tw|0))+tw*Math.min(th-1,Math.max(0,V*th|0)));
        depth[index]=d;frame[index]=0xff000000|((tex[p+2]*light|0)<<16)|((tex[p+1]*light|0)<<8)|(tex[p]*light|0);
      }
    }
  }
  function matrix(x,y,z,yaw){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,x,y,z,1]);
  }
  function seatPose(a,transform){
    // Align the animated pelvis to the cushion in its local coordinate frame.
    const hip=a.world[a.r.hips],scale=a.r.scale;
    const dx=-hip[12]*scale,dy=.095-hip[13]*scale,dz=-hip[14]*scale;
    for(let i=0;i<3;i++)transform[12+i]+=transform[i]*dx+transform[4+i]*dy+transform[8+i]*dz;
  }
  function frame(machine,foot,kind,dt,p,phone){
    if(phone)phone.visible=false;
    if(!active)return null;
    let transform;
    if(foot){
      const speed=p.speed,clip=p.action==='call'?'make_a_call_02':p.action==='sit'?'sit':speed<.10?idle:speed>(active.clip==='run'?2.0:2.25)?'run':'walk';
      animate(active,clip,dt,p.action||clip===idle?1:Math.max(.55,Math.min(1.45,speed/(clip==='run'?3.5:1.50))));
      transform=matrix(p.x,p.y,p.z,p.heading);
      if(p.action==='sit')seatPose(active,transform);
      if(p.action==='call'&&phone){
        const point=i=>{
          const b=active.world[i],s=active.r.scale;
          return [0,1,2].map(k=>transform[12+k]+s*(transform[k]*b[12]+transform[4+k]*b[13]+transform[8+k]*b[14]));
        };
        const hand=point(active.r.hand),finger=point(active.r.finger);
        G.align(phone,hand,finger.map((v,k)=>hand[k]+1.55*(v-hand[k])));phone.visible=true;
      }
    }else{
      const socket=machine.model.rider||machine.model.operator;if(!socket)return null;
      socket.visible=false;if(kind===2)return null;
      G.worldPoint(socket);transform=socket._world.slice();
      if(machine.model.rider){
        for(let i=0;i<3;i++)transform[12+i]+=transform[4+i]*.923-transform[8+i]*.22;
      }
      animate(active,'sit',dt);seatPose(active,transform);
    }
    return {a:active,m:transform};
  }
  const contexts=new WeakMap();
  function gpu(gl,vp,{a,m},env){
    let state=contexts.get(gl);
    if(!state){
      const prog=gl.createProgram();
      const sources=[
        'attribute vec3 pos,norm;attribute vec2 uv;uniform mat4 vp,model;varying vec2 t;varying vec3 n;void main(){t=uv;n=mat3(model)*norm;gl_Position=vp*model*vec4(pos,1.);}',
        'precision mediump float;varying vec2 t;varying vec3 n;uniform sampler2D colorMap,normalMap,metalMap;uniform vec3 sun;uniform float day;void main(){vec3 albedo=texture2D(colorMap,t).rgb;float detail=texture2D(normalMap,t).b;vec2 mr=texture2D(metalMap,t).gb;float diffuse=max(dot(normalize(n),normalize(sun)),0.);gl_FragColor=vec4(albedo*(.34+.42*day+day*diffuse*(.38+.12*detail)) + vec3(.055*mr.y*(1.-mr.x)*diffuse*day),1.);}'];
      sources.forEach((src,i)=>{const sh=gl.createShader(i?gl.FRAGMENT_SHADER:gl.VERTEX_SHADER);gl.shaderSource(sh,src);gl.compileShader(sh);gl.attachShader(prog,sh);gl.deleteShader(sh);});
      ['pos','norm','uv'].forEach((s,i)=>gl.bindAttribLocation(prog,i,s));gl.linkProgram(prog);
      if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
      const u={};for(const s of ['vp','model','colorMap','normalMap','metalMap','sun','day'])u[s]=gl.getUniformLocation(prog,s);
      state={prog,u,rigs:new WeakMap()};contexts.set(gl,state);
    }
    const {prog,u,rigs}=state,r=a.r;let data=rigs.get(r);
    if(!data){
      const buffers=Array.from({length:4},()=>gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER,buffers[2]);gl.bufferData(gl.ARRAY_BUFFER,r.uv,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffers[3]);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,r.ind,gl.STATIC_DRAW);
      const maps=[r.albedo,r.normalMap,r.roughness].map(img=>{
        const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
        for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);return tex;
      });data={buffers,maps};rigs.set(r,data);
    }
    gl.useProgram(prog);gl.uniformMatrix4fv(u.vp,false,vp);gl.uniformMatrix4fv(u.model,false,m);
    gl.uniform1f(u.day,env.daylight);gl.uniform3fv(u.sun,env.sun);
    const dirty=data.actor!==a||data.rev!==a.revision;
    for(let i=0;i<3;i++){
      gl.bindBuffer(gl.ARRAY_BUFFER,data.buffers[i]);
      if(i<2&&dirty)gl.bufferData(gl.ARRAY_BUFFER,i?a.normals:a.points,gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,i===2?2:3,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,data.maps[i]);
      gl.uniform1i([u.colorMap,u.normalMap,u.metalMap][i],i);
    }
    data.actor=a;data.rev=a.revision;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,data.buffers[3]);gl.drawElements(gl.TRIANGLES,r.ind.length,gl.UNSIGNED_SHORT,0);
    gl.disableVertexAttribArray(1);gl.disableVertexAttribArray(2);
  }
  const el=id=>document.getElementById(id),dialog=el('characterDialog'),canvas=el('operatorPreview'),ctx=canvas.getContext('2d');
  const buttons=Array.from(dialog.querySelectorAll('[data-operator]')),confirm=el('confirmOperator'),status=el('operatorStatus');
  let preview,ticket=0,angle=.18,last=0,raf=0,drag=null;
  const w=canvas.width,h=canvas.height,img=ctx.createImageData(w,h),pixels=new Uint32Array(img.data.buffer),depth=new Float32Array(w*h);
  function paint(time){
    if(!dialog.open)return;
    if(preview&&time-last>=40){
      animate(preview,idle,Math.min(.1,(time-last)/1000));last=time;
      pixels.fill(0);depth.fill(0);
      raster(preview,matrix(0,0,0,angle),(x,y,z)=>{const d=3.2-z;return [w*.5+x*h*1.52/d,h*.5-(y-.89)*h*1.52/d,d];},pixels,depth,w,h);
      ctx.putImageData(img,0,0);
    }
    raf=requestAnimationFrame(paint);
  }
  async function choose(name){
    const token=++ticket;preview=null;ctx.clearRect(0,0,w,h);confirm.disabled=true;status.textContent='Carregando modelo…';
    for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.operator===name));
    try{const rig=await get(name);if(token!==ticket)return;preview=instance(rig);confirm.disabled=false;status.textContent='Arraste para girar';}
    catch(e){if(token===ticket)status.textContent='Falha ao abrir o modelo. Toque na opção para tentar novamente.';console.error(e);}
  }
  el('coverCharacter').onclick=()=>{dialog.showModal();angle=.18;last=0;choose(selected);raf=requestAnimationFrame(paint);buttons.find(b=>b.dataset.operator===selected).focus();};
  buttons.forEach(b=>b.onclick=()=>choose(b.dataset.operator));
  el('cancelOperator').onclick=()=>dialog.close();
  confirm.onclick=async()=>{if(!preview)return;await select(preview.r.name,true);el('operatorName').textContent=selected;dialog.close();};
  dialog.addEventListener('close',()=>{++ticket;cancelAnimationFrame(raf);preview=null;drag=null;el('coverCharacter').focus();});
  canvas.onpointerdown=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag!==null){angle+=(e.clientX-drag)*.017;drag=e.clientX;}};
  canvas.onlostpointercapture=()=>drag=null;el('operatorName').textContent=selected;
  return {ensure:()=>active?Promise.resolve():select(selected),frame,raster,gpu,get ready(){return !!active;}};
})();
