/* Sons originais sintetizados localmente. Os loops compartilham buffers
   e a mixagem acompanha a ação mesmo quando o operador está a pé. */
window.FieldSound = (() => {
  // Pulsos por segundo em marcha lenta, ressonância do escape e do bloco.
  const profiles = {
    exc:[36,88,235],back:[27,109,305],grader:[39,98,267],
    truck:[33,79,194],pickup:[28,134,352],bike:[14,175,489]
  };
  const engines=new Map();
  let ctx,master,pump,alarm,rain,tread,gravel,air,noise,activeEngine;
  function motorVoice(type){
    if(engines.has(type))return engines.get(type);
    const [idle,pipe,block]=profiles[type],rate=16000,length=2*rate;
    const buffer=ctx.createBuffer(1,length,rate),samples=buffer.getChannelData(0);
    let seed=3711;
    function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    // Cada combustão excita duas ressonâncias amortecidas e um sopro curto.
    // As caudas atravessam o ponto de loop para evitar estalos.
    for(let stroke=0;stroke<2*idle;stroke++){
      const start=Math.round((stroke+.08*(random()-.5))*rate/idle)+length;
      const force=(.78+.25*random())*(stroke%2===0?1:.88);
      const freq=pipe*(.975+.05*random());
      let hiss=0;
      for(let k=0;k<rate*.095;k++){
        const t=k/rate;
        hiss=.62*hiss+.38*(random()*2-1);
        const low=Math.sin(2*Math.PI*freq*t+.8*(1-Math.exp(-65*t)))*Math.exp(-55*t);
        const knock=Math.sin(2*Math.PI*block*t)*Math.exp(-132*t);
        const attack=1-Math.exp(-2100*t);
        samples[(start+k)%length]+=force*attack*(.78*low+.24*knock+.80*hiss*Math.exp(-91*t));
      }
    }
    let peak=.001;for(const v of samples)peak=Math.max(peak,Math.abs(v));
    for(let k=0;k<length;k++)samples[k]=Math.tanh(1.4*samples[k]/peak)*.93;
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
    const v=voice(source,'lowpass',820);engines.set(type,v);return v;
  }
  let cadence=0, wildlife=1.5, lastMachine, lastLoad=0, clock=0, nextMix=0;
  const follow=(param,value,seconds=.08)=>param.setTargetAtTime(value,ctx.currentTime,seconds);
  function voice(source, type, hz, q=.72) {
    const filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    filter.type=type; filter.frequency.value=hz; filter.Q.value=q;
    gain.gain.value=0; source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(); return {source,filter,gain:gain.gain};
  }
  function oscillator(shape, hz, filter, cutoff) {
    const source=ctx.createOscillator();source.type=shape;source.frequency.value=hz;
    return voice(source,filter,cutoff);
  }
  function layer(type,hz,rate) {
    const source=ctx.createBufferSource();source.buffer=noise;source.loop=true;
    source.playbackRate.value=rate;return voice(source,type,hz);
  }
  function unlock() {
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    if(!ctx) {
      ctx=new Audio();master=ctx.createGain();master.gain.value=0;
      master.connect(ctx.destination);
      noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*2.67),ctx.sampleRate);
      const samples=noise.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      pump=layer('bandpass',750,.54);
      alarm=oscillator('sine',840,'lowpass',1150);
      rain=layer('highpass',1550,1.04);tread=layer('bandpass',1100,.67);
      gravel=layer('lowpass',750,.87);air=layer('lowpass',280,.33);
    }
    if(ctx.state!=='running')ctx.resume().catch(()=>{});
  }
  function burst({tone=false,from,to=from,level,duration,delay=0,type='bandpass',rate=1}) {
    if(!ctx)return;
    const start=ctx.currentTime+delay,end=start+duration;
    const src=tone?ctx.createOscillator():ctx.createBufferSource();
    const filter=ctx.createBiquadFilter(),g=ctx.createGain();
    filter.type=type;filter.Q.value=.85;
    if(tone){src.type='sine';src.frequency.setValueAtTime(from,start);src.frequency.exponentialRampToValueAtTime(to,end);filter.frequency.value=8000;}
    else {src.buffer=noise;src.playbackRate.value=rate;filter.frequency.setValueAtTime(from,start);filter.frequency.exponentialRampToValueAtTime(to,end);}
    g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(level,start+.012);g.gain.exponentialRampToValueAtTime(.0001,end);
    src.connect(filter);filter.connect(g);g.connect(master);
    src.onended=()=>{src.disconnect();filter.disconnect();g.disconnect();};
    if(tone)src.start(start);else src.start(start,Math.random());
    src.stop(end+.02);
  }
  function ignition() {
    for(let i=0;i<5;i++)burst({from:470+i*45,to:190,level:.17+i*.015,duration:.09,delay:i*.063,rate:.72});

  }
  function quiet(){if(ctx)follow(master.gain,0,.025);if(activeEngine)follow(activeEngine.gain,0,.025);nextMix=0;cadence=0;lastMachine=null;}
  function step(dt,m,input,onFoot,env,soil,volume){
    if(!ctx)return;
    clock+=dt;nextMix-=dt;
    const running=!onFoot&&m.running;
    const walking=onFoot?Math.min(1,Math.hypot(input.x||0,input.y||0)):0;
    const speed=onFoot?walking*2.7:Math.abs(m.speed);
    const mud=env.wet*soil.basin, sand=soil.sand||0, stones=soil.gravel||0;
    cadence+=dt*(onFoot?walking*2.25:m.type==='exc'?speed*3.5:0);
    if(cadence>=1) {
      cadence%=1;
      burst({from:soil.gravel>.5?2400:soil.sand>.5?840:mud>.35?570:1550,to:mud>.35?135:500,level:onFoot?.32:.12,duration:mud>.35?.24:.12});
      if(mud>.35)burst({tone:true,from:170,to:73,level:.07,duration:.11,delay:.04});
    }
    wildlife-=dt;
    if(wildlife<=0){
      const day=env.daylight>.55;
      wildlife=(day?3.5:1.1)+Math.random()*(day?4.5:1.7);
      if(env.rain<.4 && (!running||onFoot)){
        const f=(day?1870:3100)+Math.random()*540;
        for(let j=0;j<(day?2:3);j++)burst({tone:true,from:f,to:f*(day?1.39:1.04),level:day?.008:.004,duration:day?.13:.057,delay:j*(day?.18:.095)});
      }
    }
    if(nextMix>0)return;
    nextMix=.05;
    const change=lastMachine===m?Math.abs(m.load-lastLoad):0;
    lastLoad=m.load;lastMachine=m;
    const effort=running?m.engine:0,hyd=running&&!['pickup','bike'].includes(m.type)?Math.max(...Object.values(m.axes).map(Math.abs)):0;
    follow(master.gain,volume*.78);
    if(running){
      const voice=motorVoice(m.type);
      if(activeEngine&&voice!==activeEngine)follow(activeEngine.gain,0);
      activeEngine=voice;
      const road=m.type==='bike'||m.type==='pickup';
      const rpmRatio=Math.max(.73,m.rpm/780);
      const gear=road?Math.min(3,Math.floor(speed/(m.type==='bike'?3.1:3.8))):0;
      const pitch=road?(1+effort*(m.type==='bike'?1.65:.72)+speed*.095)/(1+gear*.20):.65+.35*rpmRatio;
      follow(voice.source.playbackRate,pitch,.14);
      follow(voice.filter.frequency,(road?1220:810)+effort*690);
      follow(voice.gain,.41+.13*effort,.15);
    }else if(activeEngine){follow(activeEngine.gain,0,.09);}
    follow(pump.gain,hyd*.105);
    follow(pump.filter.frequency,600+hyd*380+effort*120);
    follow(alarm.gain,running&&!['bike','pickup'].includes(m.type)&&m.speed<-.16&&clock%.91<.23?.105:0,.018);
    follow(rain.gain,env.rain*.13);follow(air.gain,.025+.045*env.rain);
    follow(tread.gain,onFoot?0:Math.min(1,speed/5)*(.10-.055*mud+.10*stones+.035*sand));
    follow(tread.filter.frequency,Math.max(200,1250-soil.cover*550-mud*710+stones*1600-sand*680));
    follow(gravel.gain,Math.min(.60,change*9+(running?m.resist*hyd*.6:0)+mud*Math.min(speed/5,.25)));
  }
  return {unlock,step,quiet,ignition};
})();
