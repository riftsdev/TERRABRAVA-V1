/* Terra Brava — garagem e estação de operação. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const ui = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), node => [node.id,node]));
  const fleet = {
    bike:{name:'Moto de trilha',title:['Moto de','trilha'],tag:'Deslocamento',description:'Percorra o canteiro e reconheça o traçado da estrada.'},
    pickup:{name:'Picape de serviço',title:['Picape de','serviço'],tag:'Abastecimento',description:'Carregue diesel e óleo no depósito e abasteça a frota estacionada.'},
    exc: {name:'Escavadeira hidráulica', title:['Escavadeira','hidráulica'], tag:'Escavação', description:'Escave com o braço articulado e gire a torre para carregar o caminhão.'},
    back: {name:'Retroescavadeira', title:['Retro','escavadeira'], tag:'Carga e escavação', description:'Carregue terra com a pá dianteira e abra valas com o braço traseiro.'},
    grader: {name:'Motoniveladora', title:['Moto','niveladora'], tag:'Nivelamento', description:'Ajuste a altura e o ângulo da lâmina para nivelar a pista de terra.'},
    truck: {name:'Caminhão basculante', title:['Caminhão','basculante'], tag:'Transporte', description:'Receba a carga na carroceria, dirija até o depósito e bascule a terra.'}
  };
  const ico = name => '<svg aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  let selected='exc',playing=false,state=null,toastTimer=0,openedDuringPlay=false;
  let helpInput=matchMedia('(pointer:coarse)').matches?'touch':'keys',previousFocus=null;
  const game=(fn,...args)=>{if(window.Game && typeof Game[fn]==='function')return Game[fn](...args)};
  const text=(el,t)=>{const v=String(t);if(el.textContent!==v)el.textContent=v};
  const pressed=(el,v)=>{const s=String(!!v);if(el.getAttribute('aria-pressed')!==s)el.setAttribute('aria-pressed',s)};
  function select(type) {
    if(!fleet[type])return;
    selected=type;
    const f=fleet[type];
    ui.hero.dataset.type=type;
    ui.modelTitle.replaceChildren(document.createTextNode(f.title[0]),document.createElement('br'),document.createTextNode(f.title[1]));
    text(ui.modelDescription,f.description);
    ui.heroImage.src='assets/'+type+'.webp';
    for(const btn of ui.fleetList.children)pressed(btn,btn.dataset.machine===type);
    ui.start.setAttribute('aria-label','Operar máquina: '+f.name);
    ui.helpMachine.value=type;
  }
  for(const [type,f] of Object.entries(fleet)){
    const btn=document.createElement('button');
    btn.type='button';btn.className='fleet-card';btn.dataset.machine=type;btn.setAttribute('aria-label',f.name);
    btn.innerHTML='<img class="card-photo" src="assets/'+type+'.webp" alt="" draggable="false"><span class="card-check">'+ico('check')+'</span><span class="card-info"><span class="card-tag">'+f.tag+'</span><strong class="card-title">'+f.name+'</strong></span>';
    btn.addEventListener('click',()=>select(type));ui.fleetList.append(btn);
  }
  ui.brand.addEventListener('click',e=>{e.preventDefault();ui.garage.hidden=true;ui.cover.hidden=false;ui.coverStart.focus()});
  ui.start.addEventListener('click',()=>game('start',selected));
  ui.coverStart.onclick=()=>game('start',selected);
  ui.coverSettings.onclick=()=>showGuide();
  ui.ignition.onclick=()=>game('ignition');
  ui.service.onclick=()=>game('service');
  window.addEventListener('keydown',e=>{
    if(ui.cover.hidden||document.querySelector('dialog[open]'))return;
    const items=[ui.coverStart,ui.coverCharacter,ui.coverSettings];
    if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code)){
      e.preventDefault();items[(Math.max(0,items.indexOf(document.activeElement))+(['ArrowUp','ArrowLeft'].includes(e.code)?2:1))%3].focus();
    }else if((e.code==='Enter'||e.code==='Space')&&!items.includes(document.activeElement)){
      e.preventDefault();ui.coverStart.click();
    }
  });
  ui.workMode.onclick=()=>game('setMode','work');
  ui.driveMode.onclick=()=>game('setMode','drive');
  ui.toolToggle.onclick=()=>game('toggleTool');
  ui.interact.onclick=()=>game('interact');
  ui.camera.onclick=()=>game('cycleCamera');
  let expanded=false;
  function toolsOpen(value){
    expanded=value;ui.hud.classList.toggle('tools-open',value);
    ui.moreTools.setAttribute('aria-expanded',String(value));
    ui.moreTools.setAttribute('aria-label',value?'Fechar ações':'Abrir ações');
  }
  ui.moreTools.onclick=()=>toolsOpen(!expanded);
  ui.extraTools.addEventListener('click',()=>toolsOpen(false));
  ui.shiftTime.onclick=()=>game('nextTime');
  function missionOpen(value){ui.hint.hidden=!value;ui.missionToggle.setAttribute('aria-expanded',String(value));}
  ui.missionToggle.onclick=()=>missionOpen(ui.hint.hidden);
  missionOpen(!matchMedia('(pointer:coarse), (max-width:750px)').matches);
  ui.viewDistance.onchange=()=>game('setDistance',ui.viewDistance.value);
  ui.graphics.onchange=()=>game('setQuality',ui.graphics.value);
  ui.volume.oninput=()=>{game('setVolume',Number(ui.volume.value)/100);text(ui.volumeRead,ui.volume.value+'%');};
  ui.weather.onclick=()=>game('cycleWeather');
  ui.sound.onclick=()=>game('toggleSound');
  ui.returnGarage.onclick=()=>game('garage');
  const pads={}; let brakePointer=null;
  for(const side of ['left','right']){
    const pad=ui[side+'Stick'],nub=pad.querySelector('.pad-nub');
    const slot={el:pad,nub,pointer:null};pads[side]=slot;
    const move=e=>{
      if(slot.pointer!==e.pointerId)return;
      const b=pad.getBoundingClientRect(),r=b.width*.36;
      let x=(e.clientX-b.left-b.width/2)/r,y=-(e.clientY-b.top-b.height/2)/r;
      const d=Math.hypot(x,y); if(d>1){x/=d;y/=d;}
      nub.style.transform='translate('+x*r*.83+'px,'+(-y*r*.83)+'px)';
      if(d<.085){x=0;y=0;}
      game('setStick',side,x,y);
    };
    pad.addEventListener('pointerdown',e=>{
      if(slot.pointer!==null||!playing||e.button!==0)return;
      e.preventDefault();slot.pointer=e.pointerId;pad.setPointerCapture(e.pointerId);pad.classList.add('active');move(e);
    });
    pad.addEventListener('pointermove',move);
    for(const event of ['pointerup','pointercancel','lostpointercapture']){
      pad.addEventListener(event,e=>{if(slot.pointer===e.pointerId)releasePad(side)});
    }
    pad.addEventListener('contextmenu',e=>e.preventDefault());
  }
  function releasePad(side){
    const slot=pads[side],id=slot.pointer;slot.pointer=null;
    slot.nub.style.transform='';slot.el.classList.remove('active');
    if(id!==null && slot.el.hasPointerCapture(id))slot.el.releasePointerCapture(id);
    game('setStick',side,0,0);
  }
  function releaseBrake(){
    const id=brakePointer;brakePointer=null;
    if(id!==null && ui.brake.hasPointerCapture(id))ui.brake.releasePointerCapture(id);
    ui.brake.classList.remove('active');game('setBrake',false);
  }
  const roadPointers=new Map();
  function applyArrows(){
    const active=new Set(roadPointers.values());
    for(const btn of ui.roadArrows.querySelectorAll('button'))btn.classList.toggle('active',active.has(btn.dataset.arrow));
    game('setStick','left',Number(active.has('right'))-Number(active.has('left')),Number(active.has('forward'))-Number(active.has('back')));
  }
  for(const btn of ui.roadArrows.querySelectorAll('button')){
    btn.addEventListener('pointerdown',e=>{
      if(!playing||e.button!==0)return;
      e.preventDefault();btn.setPointerCapture(e.pointerId);roadPointers.set(e.pointerId,btn.dataset.arrow);applyArrows();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(event,e=>{
      if(roadPointers.delete(e.pointerId))applyArrows();
    });
    btn.addEventListener('contextmenu',e=>e.preventDefault());
  }
  function releaseControls(){roadPointers.clear();applyArrows();releasePad('left');releasePad('right');releaseBrake()}
  ui.brake.addEventListener('pointerdown',e=>{
    if(brakePointer!==null||e.button!==0)return;
    e.preventDefault();brakePointer=e.pointerId;ui.brake.setPointerCapture(e.pointerId);ui.brake.classList.add('active');game('setBrake',true);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])ui.brake.addEventListener(event,e=>{if(e.pointerId===brakePointer)releaseBrake()});
  ui.brake.addEventListener('keydown',e=>{if(e.key==='Enter'||e.code==='Space'){e.preventDefault();ui.brake.classList.add('active');game('setBrake',true)}});
  ui.brake.addEventListener('keyup',e=>{if(e.key==='Enter'||e.code==='Space')releaseBrake()});
  function openDialog(dialog){
    previousFocus=document.activeElement;openedDuringPlay=playing;
    if(playing)game('pause',true);
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }
  function closeDialog(dialog){
    if(typeof dialog.close==='function')dialog.close();
    else{dialog.removeAttribute('open');resumeDialog();}
  }
  function interactions(machine,seat,loaded){
    ui.enterNearby.hidden=!machine;
    if(machine)text(ui.enterNearby,'Entrar · '+fleet[machine.type].name);
    ui.sitNearby.hidden=!seat;ui.sitNearby.disabled=!loaded;
    if(seat)text(ui.sitNearby,'Sentar · '+seat.label);
    ui.callPhone.disabled=!loaded;
    openDialog(ui.interactions);
    ui.interactions.querySelector('button:not([hidden]):not([disabled])').focus();
  }
  for(const [button,kind] of [[ui.enterNearby,'enter'],[ui.sitNearby,'sit'],[ui.callPhone,'call']]){
    button.onclick=()=>{closeDialog(ui.interactions);game('performInteraction',kind);};
  }
  ui.closeInteractions.onclick=()=>closeDialog(ui.interactions);
  ui.interactions.onkeydown=e=>{
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();e.stopPropagation();document.activeElement?.click();}
  };
  function resumeDialog(){
    if(openedDuringPlay&&playing)game('pause',false);openedDuringPlay=false;
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;
  }
  for(const dialog of [ui.guide,ui.mapModal,ui.interactions]){
    dialog.addEventListener('close',resumeDialog);
    dialog.addEventListener('click',e=>{
      if(e.target!==dialog)return;
      const b=dialog.getBoundingClientRect();
      if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)closeDialog(dialog);
    });
  }
  function showGuide(){ui.viewDistance.value=game('getDistance');ui.graphics.value=game('getQuality')||'auto';ui.volume.value=Math.round((game('getVolume')??.8)*100);text(ui.volumeRead,ui.volume.value+'%');ui.helpMachine.value=playing ? state?.type||selected : selected;guide();openDialog(ui.guide)}
  ui.garageHelp.onclick=ui.hudHelp.onclick=showGuide;
  ui.closeGuide.onclick=()=>closeDialog(ui.guide);
  const helpTabs={touch:ui.touchHelp,keys:ui.keyHelp,pad:ui.padHelp};
  for(const [id,tab] of Object.entries(helpTabs)){
    tab.onclick=()=>{helpInput=id;guide()};
  }
  ui.helpMachine.onchange=guide;
  function changeScheme(mirror){
    if((game('isInverted')??true)!==mirror)game('toggleInversion');
    guide();
  }
  ui.mirrorScheme.onclick=()=>changeScheme(true);
  ui.oldScheme.onclick=()=>changeScheme(false);
  const row=(a,b)=>'<div class="guide-line"><b>'+a+'</b><span>'+b+'</span></div>';
  const block=(title,rows)=>'<section class="guide-block"><h3>'+title+'</h3>'+rows.map(pair=>row(...pair)).join('')+'</section>';
  const note=t=>'<p class="guide-note">'+t+'</p>';
  function guide(){
    const type=ui.helpMachine.value, touch=helpInput==='touch',pad=helpInput==='pad';
    const mirror=game('isInverted')??true;
    for(const [id,tab] of Object.entries(helpTabs))pressed(tab,id===helpInput);
    pressed(ui.mirrorScheme,mirror);pressed(ui.oldScheme,!mirror);
    text(ui.oldScheme,'Anterior');
    const nameLeft=pad?'analógico esquerdo (LS)':'alavanca esquerda';
    const nameRight=pad?'analógico direito (RS)':'alavanca direita';
    const arrows=touch||pad;
    const vertical=arrows?'↑ / ↓':'I / K',horizontal=arrows?'← / →':'J / L';
    const actions=(first,second)=>mirror?second+' / '+first:first+' / '+second;
    const interact=touch?'Sair / Entrar':pad?'A':'E';
    let body=note(type==='exc'||type==='back'?'Alavanca direita: frente ergue, trás abaixa, esquerda fecha e direita abre.':'O esquema selecionado define o sentido dos comandos hidráulicos.');
    if(pad){
      body+=block('Gamepad • '+fleet[type].name,[
        ['Menu','Direcional escolhe • A confirma • B fecha o manual. Na lista de máquinas, use ← e →.'],
        ...(type==='exc'?[
          ['L1 / L2','Esteira esquerda • avançar / recuar.'],['R1 / R2','Esteira direita • avançar / recuar.'],
          ['L1 + R1 / L2 + R2','Avançar reto / recuar reto.'],['L1 + R2 / R1 + L2','Girar à direita / à esquerda no próprio eixo.'],
          ['Analógicos','Os dois operam a hidráulica durante o deslocamento.']
        ]:[['R2 / L2','Avançar / recuar. Esterce com o analógico esquerdo ou o direcional.']]),
        ['A / X','Entrar ou sair / ligar ou desligar o motor.'],
        ['B / R3','Segurar freio / trocar câmera.'],['Y / L3','Trocar implemento na retro / alternar o modo das alavancas.'],
        ['Menu (Start)','Aceitar a obra ou atender com a picape.']
      ]);
    }else{
      body+=block('Condução',touch?[['Direção',['pickup','bike'].includes(type)?'← e → esterçam. Segure ↑ para acelerar ou ↓ para frear e dar ré. Combine as setas com dois dedos.':'Em Condução, a alavanca esquerda avança, dá ré e vira.'],['Freio','Segure para frear.']]:[['WASD / setas','Avançar, dar ré e virar a máquina.'],['Espaço','Segure para frear.']]);
    }
    if(!pad)body+=block('Partida e serviço',[[touch?'Ligar motor':'R','Ligar ou desligar o motor. Entre, ligue e só então movimente a máquina.'],[touch?'Aceitar obra / Atender':'V','Perto da placa, aceite a obra. Com a picape parada, reponha no depósito ou transfira junto à máquina.']]);
    body+=block('Entrar, sair e caminhar',[
      [interact,'Pare a máquina e saia da cabine. A pé, abra Interações para ligar, usar um assento próximo ou entrar na cabine. Movimente-se para levantar ou encerrar a ligação.'],
      [touch?'Alavancas':pad?'LS / RS':'WASD / mouse',touch||pad?'A esquerda anda em relação à câmera. A direita olha ao redor.':'Caminhe com WASD ou as setas. Arraste o cenário com o mouse para olhar ao redor.']
    ]);
    if(type==='exc'||type==='back'){
      if(type==='back'){
        body+=block('Pá dianteira · '+nameRight,[[vertical,'Erguer os braços / abaixar os braços'],[horizontal,'Fechar e colher / abrir e despejar']]);
        body+=note((touch?'Toque no botão de implemento':pad?'Pressione Y':'Pressione X')+' com a retroescavadeira parada para alternar entre a pá e o braço traseiro. Os estabilizadores acompanham a troca.');
      }
      body+=block((type==='back'?'Braço traseiro':'Trabalho')+' · '+nameLeft,[
        [arrows?'↑ / ↓':'T / G',actions('Estender o braço','Recolher o braço')],
        [arrows?'← / →':'F / H',actions('Girar à direita','Girar à esquerda')]
      ]);
      body+=block('Escavação · '+nameRight,[
        [vertical,'Erguer a lança / abaixar a lança'],
        [horizontal,'Fechar e recolher / abrir e despejar']
      ]);
      body+=note('Escave em qualquer solo transitável do canteiro. Com a concha cheia em Trabalho, a guia pontilhada mostra onde a terra vai cair e fica verde sobre a carroceria.');
    }
    if(type==='grader')body+=block('Lâmina · '+nameRight,[[vertical,actions('Abaixar a lâmina','Erguer a lâmina')],[horizontal,actions('Girar para a esquerda','Girar para a direita')]])+note('Para nivelar qualquer trecho de solo transitável, abaixe a lâmina até tocar a terra e avance devagar.');
    if(type==='truck')body+=block('Basculante · '+nameRight,[[vertical,actions('Baixar a caixa','Levantar a caixa')]])+note('Posicione a traseira onde quer descarregar e levante a caixa.');
    if(type==='pickup')body+=note('O depósito D fica junto à oficina. Leve até 160 L de diesel e 20 L de óleo. Estacione a até 6,5 m de uma máquina desligada para transferir.');
    if(type==='bike')body+=note('Use a moto para reconhecer o terreno e visitar a placa de obra perto da patrol.');
    if(!pad)body+=block('Câmera e garagem',touch?[['Visão','Toque no ícone de câmera para trocar de vista. Na visão orbital, arraste o cenário e use dois dedos para o zoom.'],['Garagem','Toque no ícone de galpão para escolher outra máquina.']]:[['C','Trocar entre as vistas orbital, da ferramenta e da cabine.'],['Mouse','Arraste a visão orbital. Gire a roda para aproximar ou afastar.'],['M','Voltar à garagem e trocar de máquina.']]);
    body+=block('Tempo e terreno',[[touch?'Relógio':'Relógio / P','Avance até o próximo amanhecer, meio-dia, entardecer ou noite. O ciclo também avança sozinho.'],[touch?'Ícone do clima':'Clima / N','Alterne entre céu limpo, garoa e chuva forte. A terra encharca e seca aos poucos.']]);
    ui.guideContent.innerHTML=body;
  }
  const zoneStyles={sand:['#e7c98c','Areia'],gravel:['#adbfc6','Brita'],cut:['#d99f52','Corte'],dump:['#79afbf','Descarga na vila'],depot:['#edbd71','Depósito'],contract:['#f4ce5a','Obra'],grade:['#85b275','Início da estrada']};
  function drawMap(canvas,map,large){
    if(!map||!canvas.getContext)return;
    const c=canvas.getContext('2d');if(!c)return;
    const w=canvas.width,h=canvas.height;
    const minx=large?-512:-22,maxx=large?512:36;
    const minz=large?-512:-25,maxz=large?512:27;
    const scale=Math.min(w/(maxx-minx),h/(maxz-minz))*.9;
    const cx=large?(minx+maxx)/2:map.x;
    const cz=large?(minz+maxz)/2:map.z;
    const X=x=>w/2+(x-cx)*scale, Z=z=>h/2-(z-cz)*scale;
    c.clearRect(0,0,w,h);c.fillStyle='#202d26';c.fillRect(0,0,w,h);
    c.strokeStyle='#a1b09824';c.lineWidth=1;c.beginPath();
    for(let v=-130;v<=130;v+=10){c.moveTo(X(v),0);c.lineTo(X(v),h);c.moveTo(0,Z(v));c.lineTo(w,Z(v));}c.stroke();
    for(const path of [...Rural.roads,Rural.trail]){
      c.strokeStyle=path===Rural.trail?'#839663':'#9b8060';c.lineWidth=large?1.4:2;c.beginPath();
      path.forEach(([x,z],i)=>i?c.lineTo(X(x),Z(z)):c.moveTo(X(x),Z(z)));c.stroke();
    }
    if(large){c.font='11px sans-serif';c.fillStyle='#efe2ca';c.textAlign='left';
      for(const [label,x,z] of Rural.sites){c.fillRect(X(x)-2,Z(z)-2,4,4);c.fillText(label,X(x)+4,Z(z)-3);}
    }
    if(map.work){
      for(const [index,done] of map.work.done.entries()){
        const x=map.work.start+index;
        c.fillStyle=done?'#7fd094':'#d79d50';c.fillRect(X(x),Z(map.work.z+1),Math.max(1,scale),Math.max(2,scale*2));
      }
    }
    for(const [key,z] of Object.entries(map.zones||{})){
      if(!zoneStyles[key])continue;const [color,label]=zoneStyles[key],sx=X(z.x),sz=Z(z.z);
      c.fillStyle=color+'37';c.strokeStyle=color;c.setLineDash(large?[5,4]:[3,3]);c.lineWidth=large?1.8:1.45;c.beginPath();c.arc(sx,sz,z.r*scale,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);
      if(large&&key==='depot'){c.font='bold 16px sans-serif';c.textAlign='center';c.fillStyle=color;c.fillText(label,sx,sz+z.r*scale+16);}
    }
    for(const m of map.machines||[]){
      const active=m.type===(map.onFoot?'person':state?.type);
      const x=X(m.x),y=Z(m.z);
      c.save();c.translate(x,y);c.rotate(m.heading||0);c.beginPath();
      if(active){const r=large?8:6;c.moveTo(0,-r*1.3);c.lineTo(r,r);c.lineTo(0,r*.50);c.lineTo(-r,r);c.closePath();c.fillStyle='#fffcea';}
      else{c.rect(large?-3:-2,large?-5:-3,large?6:4,large?10:6);c.fillStyle='#b2bba9';}
      c.lineWidth=1.5;c.strokeStyle='#293327';c.fill();c.stroke();c.restore();
    }
    c.textAlign='left';c.fillStyle='#e0e8d8';c.font='bold '+(large?16:17)+'px sans-serif';c.fillText('N',8,large?22:21);
  }
  ui.mapButton.onclick=()=>{if(state?.map){drawMap(ui.mapLarge,state.map,true);openDialog(ui.mapModal)}};
  ui.closeMap.onclick=()=>closeDialog(ui.mapModal);
  function hud(s){
    state=s;
    const road=!s.onFoot && (s.type==='bike'||s.type==='pickup');
    ui.roadArrows.hidden=!road;ui.leftControl.hidden=road;
    text(ui.fpsRead,s.fps??'—');
    text(ui.clockRead,s.time);text(ui.soilRead,s.surface);
    const climateTitle=s.weather+' · alternar clima (N)';
    if(ui.weather.title!==climateTitle){ui.weather.title=climateTitle;ui.weather.setAttribute('aria-label',climateTitle);ui.weather.querySelector('use').setAttribute('href',s.weather==='Céu limpo'?'#i-sun':'#i-cloud');}
    ui.hud.dataset.mud=String(s.surface==='Lama');
    ui.hud.dataset.running=String(!s.onFoot && s.running);
    const f=fleet[s.type];if(!f)return;
    const walking=!!s.onFoot;
    ui.hud.dataset.walking=String(walking);
    ui.modeSelector.hidden=ui.instruments.hidden=ui.brake.hidden=ui.camera.hidden=ui.keyHyd.hidden=walking;
    ui.ignition.hidden=walking; text(ui.ignition,s.running?'Desligar':'Ligar motor');
    ui.service.hidden=!(s.nearSite&&!s.work.active)&&!(s.type==='pickup'&&!walking);
    text(ui.service,s.nearSite&&!s.work.active?'Aceitar obra':'Atender');
    const money='R$ '+s.work.balance.toLocaleString('pt-BR');
    let status=walking?'A pé':(s.running?'Ligado':'Motor desligado')+(s.type==='bike'?'':' · '+Math.ceil(s.fuel)+' L');
    if(s.type==='pickup'&&!walking)status+=' · Carga '+Math.floor(s.diesel)+' L / '+Math.floor(s.oilCargo)+' L';
    text(ui.statusLine,status+' · '+money);
    if(!walking&&['bike','pickup','truck','grader'].includes(s.type))ui.modeSelector.hidden=true;
    ui.interact.disabled=false;
    const action=walking?(s.action==='sit'?'Levantar':s.action==='call'?'Desligar':'Interagir'):'Sair';
    text(ui.interact.querySelector('span'),action);text(ui.keyInteract,action);
    ui.interact.setAttribute('aria-label',action+' (E)');
    ui.nearCab.hidden=!walking;
    text(ui.nearCab,s.action==='call'?'Em ligação':s.action==='sit'?'Sentado':s.nearSeat||s.nearMachine||'Interações');
    text(ui.keyMove,walking?'Caminhar':'Dirigir');
    text(ui.hudName,walking?'Operador a pé':f.name);text(ui.speed,Math.round(s.speed||0));text(ui.load,(s.load||0).toFixed(2).replace('.',','));text(ui.rpm,Math.round(s.rpm||0));
    ui.loadWrap.hidden=ui.loadDivider.hidden=!(s.capacity>0);
    ui.loadWrap.title='Capacidade: '+(s.capacity||0).toFixed(1).replace('.',',')+' m³';
    pressed(ui.workMode,s.mode==='work');pressed(ui.driveMode,s.mode==='drive');
    ui.toolToggle.hidden=walking||s.type!=='back';text(ui.toolToggle.querySelector('span'),s.tool==='rear'?'Traseiro':'Dianteira');
    ui.toolToggle.title='Trocar implemento da retroescavadeira';
    const arm=s.type==='exc'||(s.type==='back'&&s.tool==='rear');
    text(ui.leftLabel,walking?'Caminhar':s.mode==='work'&&arm?'Braço · Giro':'Tração · Direção');
    ui.rightControl.hidden=!walking&&['bike','pickup'].includes(s.type);
    text(ui.rightLabel,walking?'Olhar':arm?'Lança · Concha':s.type==='back'?'Braços · Pá':s.type==='grader'?'Lâmina · Ângulo':'Caixa basculante');
    const soundHref=s.sound?'#i-sound':'#i-mute';const use=ui.sound.querySelector('use');if(use.getAttribute('href')!==soundHref)use.setAttribute('href',soundHref);
    pressed(ui.sound,!!s.sound);ui.sound.title=s.sound?'Desligar som':'Ligar som';ui.sound.setAttribute('aria-label',ui.sound.title);
    ui.camera.title='Câmera '+(s.camera||'orbital')+' · alternar (C)';
    const pct=Math.round(100*Math.min(1,Math.max(0,s.progress||0)));
    text(ui.progressText,pct+'%');ui.progressBar.style.width=pct+'%';
    text(ui.objective,s.objective||'Operação livre');text(ui.hint,s.hint||'');
    if(s.map)drawMap(ui.radar,s.map,false);
  }
  function garage(type){
    playing=false;ui.cover.hidden=true;ui.hud.hidden=true;ui.garage.hidden=false;
    document.body.classList.remove('playing');
    if(fleet[type])select(type);else select(selected);
    releaseControls();
  }
  function play(type){
    toolsOpen(false);playing=true;ui.cover.hidden=true;selected=type;ui.garage.hidden=true;ui.hud.hidden=false;ui.toast.hidden=true;
    document.body.classList.add('playing');if(document.activeElement?.blur)document.activeElement.blur();
  }
  function notice(message){clearTimeout(toastTimer);text(ui.toast,message);ui.toast.hidden=false;toastTimer=setTimeout(()=>{ui.toast.hidden=true},4400)}
  window.UI={interactions,hud,play,garage,notice,releaseControls};
  select('exc');
})();
