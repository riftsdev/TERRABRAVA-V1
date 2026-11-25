/* Relógio do canteiro. Um turno completo dura 12 minutos de simulação. */
window.Atmosphere = (() => {
  let hours = 8, weather = 0, water = 0, rain = 0;
  const weatherNames = ['Céu limpo', 'Garoa', 'Chuva forte'];
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  const state = {sun:[0,1,0], daylight:1, dusk:0, wet:0, rain:0, hours, weather};
  function refresh() {
    const angle = (hours - 6) * Math.PI / 12;
    const height = Math.sin(angle), side = Math.cos(angle);
    state.sun[0] = -.86 * side;
    state.sun[1] = height;
    state.sun[2] = .51 * side;
    const light = clamp((height + .16) / .52, 0, 1);
    state.daylight = light * light * (3 - 2 * light);
    state.dusk = (1 - clamp(Math.abs(height - .08) / .38, 0, 1)) * (1 - rain * .8);
    Object.assign(state, {hours, weather, wet:water, rain});
  }
  function step(dt) {
    hours = (hours + dt / 30) % 24;
    const target = weather === 2 ? 1 : weather * .46;
    rain += (target - rain) * -Math.expm1(-dt / 1.6);
    water += (target - water) * -Math.expm1(-dt / (target > water ? 8 : 38));
    refresh();
  }
  function nextTime() {
    hours = [6.4,12,17.6,22].find(hour => hour > hours + .04) ?? 6.4;
    refresh();
  }
  function nextWeather() { weather = (weather + 1) % 3; refresh(); }
  function restore(data) {
    if (!data || !Number.isFinite(data.hours)) return;
    hours = clamp(data.hours,0,23.9999);
    weather = clamp(Math.round(data.weather) || 0,0,2);
    water = clamp(Number(data.water) || 0,0,1);
    rain = weather === 2 ? 1 : weather * .46;
    refresh();
  }
  refresh();
  return {state, step, nextTime, nextWeather, restore, snapshot:()=>({hours,weather,water}),
    label:()=>weatherNames[weather], time:()=>[Math.floor(hours),Math.floor(hours*60)%60].map(i=>String(i).padStart(2,'0')).join(':')};
})();
