/* Película de precipitação; atualizada somente pelo loop ativo da partida. */
window.Rain = (() => {
  const canvas=document.getElementById('rainFx'), ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const drops=Array.from({length:110},()=>({x:Math.random(),y:Math.random(),depth:.45+Math.random()*.55}));
  let elapsed=0;
  function hide(){canvas.hidden=true;elapsed=0;}
  function draw(dt,intensity,tier) {
    if(!ctx||intensity<.025||reduced.matches){if(!canvas.hidden)hide();return;}
    canvas.hidden=false;elapsed+=dt;
    if(elapsed<1/30)return;
    const w=innerWidth,h=innerHeight;
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const count=Math.round((tier===2?54:94)*intensity);
    ctx.clearRect(0,0,w,h);ctx.beginPath();
    for(let i=0;i<count;i++){
      const d=drops[i],speed=(380+340*d.depth)*elapsed;
      d.y=(d.y+speed/h)%1;d.x=(d.x-speed*.19/w+1)%1;
      const x=d.x*w,y=d.y*h,len=6+12*d.depth;
      ctx.moveTo(x,y);ctx.lineTo(x-len*.19,y+len);
    }
    ctx.strokeStyle='rgba(204,226,239,.52)';ctx.lineWidth=1;ctx.stroke();elapsed=0;
  }
  hide();
  return {draw,hide};
})();
