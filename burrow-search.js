(() => {
  'use strict';
  window.createBurrowSearch = function (onFound) {
    const WATER_START = 5000;
    const WATER_END = 14500;
    const TIDE_LOW_END = 210000;
    const TIDE_DANGER_START = 270000;
    const TIDE_END = 300000;
    const SAFE_SHORE_Y = 245;
    const PLAYER_TOP_Y = SAFE_SHORE_Y-24;
    const CLUE_RADIUS = 480;
    const WALK_SPEED = 175;
    const DIG_DURATION = 260;
    const OCTOPUS_DIVE_DELAY = 1250;
    const OCTOPUS_TRACE_TIME = 3200;
    const OCTOPUS_DIG_DURATION = 460;
    const overlay = document.createElement('section');
    overlay.id = 'burrow-search';
    overlay.setAttribute('aria-label', '갯벌 구멍 탐색');
    overlay.innerHTML =
      '<canvas class="search-field" tabindex="0" aria-label="의심되는 갯벌 구멍을 선택하세요"></canvas>' +
      '<div class="search-copy"><span class="search-eyebrow">FIELD NOTE / 갯벌 탐색</span>' +
      '<h2>잠깐 나타나는 기척을 찾아봐요</h2>' +
      '<p>기포와 빨려 드는 모래를 보고, 구멍이 닫히기 전에 눌러 파 보세요.</p>' +
      '<div class="search-resources"><button type="button" class="search-basket" aria-expanded="false" aria-controls="basket-panel"></button><span class="search-count"></span><span class="search-zone"></span></div>' +
      '<div class="basket-panel" id="basket-panel" aria-label="바구니 안의 맛조개" hidden><strong>바구니 안</strong><div class="basket-list"></div><div class="basket-total"></div></div>' +
      '<div class="search-status" role="status"></div></div>' +
      '<div class="search-hint">기척 클릭: 다가가 파기 <span>·</span> 빈 곳 클릭: 이동 <span>·</span> WASD / 방향키: 걷기</div>' +
      '<div class="search-mode" role="group" aria-label="플레이 시간 선택"><button type="button" data-mode="day" aria-pressed="true">☀ 낮 · 맛조개</button><button type="button" data-mode="night" aria-pressed="false">☾ 밤 · 낙지</button></div>' +
      '<div class="tide-result" hidden><div class="tide-result-card"><span class="tide-result-mark"></span><h2></h2><p></p><strong></strong><button type="button">다음 간조 시작</button></div></div>';
    document.body.appendChild(overlay);
    const tideHud=document.createElement('div');
    tideHud.id='tide-hud';
    tideHud.innerHTML='<span class="tide-icon">◔</span><div><small>물때</small><strong>간조 · 05:00</strong><i><b></b></i></div>';
    document.body.appendChild(tideHud);
    const canvas = overlay.querySelector('.search-field');
    const ctx = canvas.getContext('2d');
    const base = document.createElement('canvas');
    const baseCtx = base.getContext('2d');
    const status = overlay.querySelector('.search-status');
    const count = overlay.querySelector('.search-count');
    const basketText = overlay.querySelector('.search-basket');
    const basketPanel = overlay.querySelector('.basket-panel');
    const basketList = overlay.querySelector('.basket-list');
    const basketTotal = overlay.querySelector('.basket-total');
    const modeButtons=overlay.querySelectorAll('.search-mode button');
    const searchTitle=overlay.querySelector('.search-copy h2');
    const searchHint=overlay.querySelector('.search-hint');
    const zoneText=overlay.querySelector('.search-zone');
    const tideResult=overlay.querySelector('.tide-result');
    const tideResultTitle=tideResult.querySelector('h2');
    const tideResultText=tideResult.querySelector('p');
    const tideResultSummary=tideResult.querySelector('strong');
    const tideResultMark=tideResult.querySelector('.tide-result-mark');
    const tideResultButton=tideResult.querySelector('button');
    const holes = [];
    const octopuses = [];
    const cuts = [];
    const surveyMarks=[];
    let active = false;
    let mode = 'day';
    let found = 0;
    let checked = 0;
    let misses = 0;
    let strokes = 0;
    let basket = 0;
    let basketWeight = 0;
    const basketItems = [];
    let basketDropAt = 0;
    let hasField = false;
    let activeHole = null;
    let width = 0;
    let height = 0;
    let mapW = 0, mapH = 0;
    let cameraX = 0, cameraY = 0;
    const player = {x: 0, y: 0, face: 1, moving: false};
    const keys = new Set();
    let walkTarget = null;
    let digging = null;
    let lastTick = 0;
    let down = false;
    let pointerId = null;
    let downX = 0, downY = 0;
    let hoverX = -100, hoverY = -100;
    let moved = 0;
    let transitioning = false;
    let generation = 0;
    let frameAt = 0;
    let raf = 0;
    let visibleMessage = '';
    let tideStartedAt=0;
    let tideEnded=false;
    let tideElapsedOverride=null;
    let lastTidePhase='low';
    let lastTideHudAt=0;
    let nextClueAt=0;
    let clueSightings=0;
    let clueClosures=0;
    let lastQuietAt=0;
    function setStatus(message) {
      if (visibleMessage === message) return;
      visibleMessage = message;
      status.textContent = message;
    }
    function rand(min, max) { return min + Math.random() * (max - min); }
    function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
    function seawardAt(y){return clamp((y-SAFE_SHORE_Y)/(mapH-SAFE_SHORE_Y-35),0,1);}
    function fieldProfile(y){
      const depth=seawardAt(y),curve=Math.pow(depth,1.12);
      const clamChance=.08+.30*curve;
      const minWeight=.75+.35*curve,maxWeight=.95+.50*curve;
      const speedFactor=1-.26*Math.pow(depth,1.18);
      const zone=depth<.30?'해안 가까이':depth<.68?'중간 갯벌':'먼 갯벌';
      const clueInterval=4200-3000*Math.pow(depth,.85);
      const activity=depth<.30?'기척 드묾':depth<.68?'기척 보통':'기척 활발';
      return {depth,clamChance,minWeight,maxWeight,speedFactor,zone,clueInterval,activity};
    }
    const TYPE_RARITY=[0,.08,.16,.36,.90,.96,.66,.45,.73,.42,1];
    function chooseClamType(depth){
      const weights=TYPE_RARITY.map(rarity=>Math.max(.08,(1-rarity)*(1.35-.84*depth)+rarity*(.16+1.82*depth)));
      let roll=Math.random()*weights.reduce((sum,value)=>sum+value,0);
      for(let i=0;i<weights.length;i++){roll-=weights[i];if(roll<=0)return i;}
      return weights.length-1;
    }
    function makeClam(h){
      const profile=fieldProfile(h.y);
      h.kind='clam';h.clamType=chooseClamType(profile.depth);
      h.weightFactor=profile.minWeight+Math.random()*(profile.maxWeight-profile.minWeight);
      h.pullEvent=randomPullEvent();
    }
    function tideElapsed(now=performance.now()){
      if(!tideStartedAt)return 0;
      return tideElapsedOverride===null?Math.max(0,now-tideStartedAt):tideElapsedOverride;
    }
    function tideState(now=performance.now()){
      const elapsed=Math.min(TIDE_END,tideElapsed(now));
      const phase=elapsed<TIDE_LOW_END?'low':elapsed<TIDE_DANGER_START?'warning':elapsed<TIDE_END?'danger':'ended';
      const flood=phase==='low'?0:phase==='warning'?.08+.24*(elapsed-TIDE_LOW_END)/(TIDE_DANGER_START-TIDE_LOW_END):phase==='danger'?.32+.68*(elapsed-TIDE_DANGER_START)/(TIDE_END-TIDE_DANGER_START):1;
      // Leave room for both wave oscillations above the permanent dry shore.
      const waterLine=(mapH+90)*(1-flood)+(SAFE_SHORE_Y+16)*flood;
      return {elapsed,remaining:Math.max(0,TIDE_END-elapsed),phase,flood,waterLine,wet:player.y>waterLine,safe:player.y<=SAFE_SHORE_Y};
    }
    function waterFront(tide,now){return tide.waterLine+Math.sin(now*.003)*7-5;}
    function movementFactor(now=performance.now()){
      const tide=tideState(now),profile=fieldProfile(player.y);
      const waterDepth=tide.wet?clamp((player.y-tide.waterLine)/170,0,1):0;
      return Math.max(.50,profile.speedFactor-waterDepth*.24);
    }
    function clueDuration(h,now){
      const depth=fieldProfile(h.y).depth,tide=tideState(now);
      return Math.max(1800,(4800-2200*depth)*(1-.28*tide.elapsed/TIDE_END));
    }
    function clueVisibility(h,now){
      if(h.flooded||h.checked||!h.signalAt)return 0;
      if(h.locked)return 1;
      const age=now-h.signalAt,left=h.signalUntil-now;
      if(age<0||left<=0)return 0;
      return Math.min(1,age/420,left/620);
    }
    function moveClueNearby(h){
      const oldX=h.x,oldY=h.y;let moved=false;
      for(let attempt=0;attempt<18;attempt++){
        const angle=rand(0,Math.PI*2),distance=rand(38,82);
        const x=clamp(oldX+Math.cos(angle)*distance,35,mapW-35);
        const y=clamp(oldY+Math.sin(angle)*distance*.45,SAFE_SHORE_Y+34,mapH-40);
        if(Math.hypot(x-oldX,y-oldY)>=34&&!holes.some(other=>other!==h&&Math.hypot(other.x-x,other.y-y)<34)){h.x=x;h.y=y;moved=true;break;}
      }
      if(!moved){const direction=oldX<mapW/2?1:-1;h.x=clamp(oldX+direction*52,35,mapW-35);h.y=clamp(oldY+18,SAFE_SHORE_Y+34,mapH-40);}
      h.angle=rand(-.55,.55);
    }
    function closeClue(h,now,move=true){
      if(!h.signalAt||h.locked)return;
      h.signalAt=0;h.signalUntil=0;h.nextSignalAt=now+rand(1500,3300);clueClosures++;
      if(move)moveClueNearby(h);
      if(active)updateHud();
    }
    function surveyPressure(x,y,now){
      let pressure=0;
      for(const mark of surveyMarks)if(now-mark.at<26000&&Math.hypot(mark.x-x,mark.y-y)<175)pressure++;
      return pressure;
    }
    function activateClue(h,now=performance.now()){
      if(!h||h.checked||h.flooded)return null;
      h.signalAt=now;h.signalUntil=now+clueDuration(h,now);h.locked=false;clueSightings++;
      surveyMarks.push({x:h.x,y:h.y,at:now});
      if(active)updateHud();
      return h;
    }
    function triggerClue(kind){
      if(mode==='night')return null;
      const now=performance.now(),tide=tideState(now);
      const candidates=holes.filter(h=>!h.flooded&&!h.checked&&(!kind||h.kind===kind)&&h.y<tide.waterLine-12)
        .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y));
      const h=candidates[0];if(!h)return null;activateClue(h,now);nextClueAt=now+900;return h;
    }
    function updateClues(now){
      if(!active||tideEnded||mode==='night')return;
      const tide=tideState(now);
      while(surveyMarks.length&&now-surveyMarks[0].at>26000)surveyMarks.shift();
      holes.forEach(h=>{
        if(h.signalAt&&!h.locked&&(now>=h.signalUntil||h.y>=tide.waterLine-8))closeClue(h,now,h.y<tide.waterLine-8);
      });
      if(now<nextClueAt)return;
      const candidates=holes.filter(h=>{
        const distance=Math.hypot(h.x-player.x,h.y-player.y);
        return !h.flooded&&!h.checked&&!h.signalAt&&!h.locked&&now>=(h.nextSignalAt||0)&&h.y<tide.waterLine-12&&distance<CLUE_RADIUS&&distance>105&&h.y>player.y-85&&surveyPressure(h.x,h.y,now)<2;
      });
      if(candidates.length){
        const weights=candidates.map(h=>1+Math.max(0,h.y-player.y)/170+h.seaward*1.4),total=weights.reduce((sum,value)=>sum+value,0);
        let roll=Math.random()*total,index=0;for(;index<weights.length-1;index++){roll-=weights[index];if(roll<=0)break;}
        const h=candidates[index];
        activateClue(h,now);
        if(clueVisibility(h,now)<.05)setStatus('근처 갯벌이 살짝 움직였어요. 기척을 살펴보세요.');
      }else if(!digging&&!walkTarget&&now-lastQuietAt>3600&&fieldProfile(player.y).depth<.55){
        lastQuietAt=now;setStatus('이 주변은 기척이 뜸해졌어요. 화면 아래 바다 쪽으로 더 나가 보세요.');
      }
      const profile=fieldProfile(player.y),tidePace=tide.phase==='low'?1:.78;
      nextClueAt=now+profile.clueInterval*tidePace*rand(.82,1.18);
    }
    function formatTime(ms){const seconds=Math.ceil(ms/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    function updateTideHud(tide,now){
      if(now-lastTideHudAt<120&&tide.phase===lastTidePhase)return;
      lastTideHudAt=now;
      const label=tide.phase==='low'?'간조':tide.phase==='warning'?'밀물 경고':tide.phase==='danger'?'위험 · 해안으로':'간조 종료';
      tideHud.className='tide-'+tide.phase+(tide.wet?' is-wet':'');
      tideHud.querySelector('strong').textContent=label+' · '+formatTime(tide.remaining);
      tideHud.querySelector('b').style.width=(tide.elapsed/TIDE_END*100).toFixed(1)+'%';
    }
    function finishTide(tide){
      if(tideEnded)return;
      tideEnded=true;keys.clear();walkTarget=null;digging=null;player.moving=false;transitioning=true;
      const rescued=!active||!tide.safe;
      const before=basketItems.length;
      let lost=0,lostWeight=0;
      if(rescued&&before){
        lost=Math.max(1,Math.ceil(before*.3));
        basketItems.splice(Math.max(0,basketItems.length-lost),lost).forEach(item=>lostWeight+=item.weight||0);
        basket=basketItems.length;basketWeight=Math.max(0,basketWeight-lostWeight);
      }
      active=true;overlay.hidden=false;document.body.classList.add('searching');basketPanel.hidden=true;
      tideResult.hidden=false;tideResult.classList.toggle('is-rescue',rescued);
      tideResultMark.textContent=rescued?'〰':'✓';
      tideResultTitle.textContent=rescued?'바닷물에 휩쓸렸어요':'제시간에 해안으로 돌아왔어요';
      tideResultText.textContent=rescued?'구조대가 해안으로 데려왔습니다. 바구니의 일부를 놓쳤어요.':mode==='night'?'밤에 잡은 낙지를 안전하게 가져왔습니다.':'오늘 잡은 맛조개를 안전하게 가져왔습니다.';
      tideResultSummary.textContent='채집 '+basket+'마리 · '+basketWeight+'g'+(lost?' · 잃어버림 '+lost+'마리':'');
      updateHud();updateTideHud({...tide,phase:'ended'},performance.now());
      dispatchEvent(new CustomEvent('mudflat:tide-end',{detail:{rescued,lost,lostWeight,basket,basketWeight}}));
    }
    function updateTide(now){
      if(!tideStartedAt||tideEnded)return tideState(now);
      const tide=tideState(now);updateTideHud(tide,now);
      let closeupFlooded=false;
      if(tide.flood>0){
        const front=waterFront(tide,now);
        octopuses.forEach(o=>{if(o.y+o.size*11>=front)o.flooded=true;});
        holes.forEach(h=>{
          if(h.flooded||h.y+12*h.size<front)return;
          h.flooded=true;h.reveal=0;h.signalAt=0;h.signalUntil=0;h.locked=false;h.crabAt=0;
          if(walkTarget?.hole===h){walkTarget=null;player.moving=false;}
          if(digging?.hole===h)digging=null;
          if(activeHole===h&&!active&&tide.phase!=='ended')closeupFlooded=true;
          if(activeHole===h&&active){activeHole=null;transitioning=false;setStatus('바닷물이 들어와 구멍이 바로 메워졌어요. 다른 기척을 찾아보세요.');}
        });
      }
      if(tide.phase!==lastTidePhase){
        lastTidePhase=tide.phase;
        if(tide.phase==='warning')setStatus('바닷물이 들어오기 시작합니다. 너무 멀리 가지 마세요.');
        if(tide.phase==='danger')setStatus('위험! 화면 위쪽의 해안으로 지금 돌아가세요.');
      }
      if(closeupFlooded)dispatchEvent(new CustomEvent('mudflat:hole-flooded'));
      if(tide.phase==='ended')finishTide(tide);
      return tide;
    }
    function updateCamera() {
      cameraX = clamp(player.x - width / 2, 0, Math.max(0, mapW - width));
      cameraY = clamp(player.y - height / 2, 0, Math.max(0, mapH - height));
    }
    function resize() {
      const oldMapW = mapW, oldMapH = mapH;
      width = innerWidth;
      height = innerHeight;
      mapW = Math.max(1100, Math.round(width * 1.8));
      mapH = Math.max(850, Math.round(height * 1.6));
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      base.width = Math.round(mapW * dpr);
      base.height = Math.round(mapH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (oldMapW && oldMapH) {
        const sx = mapW / oldMapW, sy = mapH / oldMapH;
        holes.forEach(h => { h.x *= sx; h.y *= sy; });
        octopuses.forEach(o=>{o.x*=sx;o.y*=sy;});
        cuts.forEach(c => { c.x1 *= sx; c.x2 *= sx; c.y1 *= sy; c.y2 *= sy; });
        player.x *= sx; player.y *= sy;
        if (walkTarget) { walkTarget.x *= sx; walkTarget.y *= sy; }
      } else {
        player.x = mapW / 2;
        player.y = PLAYER_TOP_Y;
      }
      updateCamera();
      drawBase();
      if (active) draw(performance.now());
    }
    function drawBase() {
      const fill = baseCtx.createLinearGradient(0, 0, mapW, mapH);
      fill.addColorStop(0, '#d6b487');
      fill.addColorStop(.58, '#caa176');
      fill.addColorStop(1, '#b98c67');
      baseCtx.fillStyle = fill;
      baseCtx.fillRect(0, 0, mapW, mapH);
      const dampness=baseCtx.createLinearGradient(0,SAFE_SHORE_Y,0,mapH);
      dampness.addColorStop(0,'#d6b48700');dampness.addColorStop(.38,'#8a87711c');dampness.addColorStop(1,'#567f7d47');
      baseCtx.fillStyle=dampness;baseCtx.fillRect(0,SAFE_SHORE_Y,mapW,mapH-SAFE_SHORE_Y);
      let seed = 98231;
      const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 150; i++) {
        const x = random() * mapW, y = random() * mapH;
        const radius = 18 + random() * 100;
        const wet = baseCtx.createRadialGradient(x, y, 2, x, y, radius);
        const depth=seawardAt(y),alpha=Math.round(45+depth*75).toString(16).padStart(2,'0');
        wet.addColorStop(0, i % 3 === 0 ? '#76928b'+alpha : '#d5c196'+alpha);
        wet.addColorStop(1, '#bb947000');
        baseCtx.fillStyle = wet;
        baseCtx.beginPath();
        baseCtx.ellipse(x, y, radius * 1.4, radius * .43, random() * 3, 0, Math.PI * 2);
        baseCtx.fill();
      }
      baseCtx.lineWidth = 1;
      for (let i = 0; i < Math.round(mapW * mapH / 950); i++) {
        const x = random() * mapW, y = random() * mapH;
        baseCtx.strokeStyle = random() > .5 ? '#886f5540' : '#f4d8a650';
        baseCtx.beginPath();
        baseCtx.moveTo(x, y);
        baseCtx.lineTo(x + 2 + random() * 18, y - 1 + random() * 3);
        baseCtx.stroke();
      }
      // Thin reflected puddles become denser toward the sea-facing end.
      for(let i=0;i<90;i++){
        const depth=.22+random()*.78,x=random()*mapW,y=SAFE_SHORE_Y+Math.pow(depth,.72)*(mapH-SAFE_SHORE_Y);
        baseCtx.globalAlpha=.08+seawardAt(y)*.22;baseCtx.fillStyle='#cce7d7';
        baseCtx.beginPath();baseCtx.ellipse(x,y,14+random()*54,2+random()*5,random()*.35,0,Math.PI*2);baseCtx.fill();
      }
      baseCtx.globalAlpha=1;
    }
    function randomPullEvent(){
      const roll=Math.random();
      return roll<.12?'mask':roll<.46?'spray':roll<.80?'grimace':'none';
    }
    function makeClueStyle(kind){
      const odds={
        clam:[.70,.66,.74],worm:[.64,.28,.46],crab:[.24,.57,.31],round:[.31,.36,.59],pin:[.42,.49,.27]
      }[kind]||[.35,.35,.35];
      return {twin:Math.random()<odds[0],bubbles:Math.random()<odds[1],suction:Math.random()<odds[2],tilt:rand(-.45,.45),spread:rand(6.5,10.5),narrow:rand(.65,1.05)};
    }
    function makeHoles() {
      holes.length = 0;
      const target = Math.max(45, Math.min(115, Math.round(mapW * mapH / 27000)));
      const spacing = width < 600 ? 58 : 64;
      for (let attempt = 0; attempt < target * 90 && holes.length < target; attempt++) {
        const x = rand(35, mapW - 35);
        const y = rand(SAFE_SHORE_Y+34, mapH - 40);
        if (Math.hypot(x - player.x, y - player.y) < 80) continue;
        if (holes.some(h => Math.hypot(h.x - x, h.y - y) < spacing)) continue;
        holes.push({id:holes.length,x, y, kind: 'round', reveal: 0, dugAt: 0, checked: false, flooded:false, angle: rand(-.55, .55), size: rand(.84, 1.18),signalAt:0,signalUntil:0,nextSignalAt:0,locked:false});
      }
      holes.forEach((h,index)=>{
        const profile=fieldProfile(h.y);
        Object.assign(h,{kind:['round','pin','crab','worm'][index%4],seaward:profile.depth,clamChance:profile.clamChance,speedFactor:profile.speedFactor});
      });
      // Resolve each depth band to its expected count. This keeps the far-field
      // advantage readable on every generated map while positions remain random.
      for(let band=0;band<4;band++){
        const group=holes.filter(h=>Math.min(3,Math.floor(h.seaward*4))===band).sort(()=>Math.random()-.5);
        const count=Math.round(group.reduce((sum,h)=>sum+h.clamChance,0));
        group.slice(0,count).forEach(makeClam);
      }
      if (!holes.some(h => h.kind === 'clam' && Math.abs(h.x - player.x) < width * .4 && Math.abs(h.y - player.y) < height * .35)) {
        const nearby = holes.filter(h => Math.abs(h.x - player.x) < width * .4 && Math.abs(h.y - player.y) < height * .35);
        if (nearby.length) {
          const h = nearby[Math.floor(Math.random() * nearby.length)];
          makeClam(h);
        }
      }
      const shallowClams=holes.filter(h=>h.kind==='clam'&&h.seaward<.35).sort((a,b)=>a.seaward-b.seaward);
      if(shallowClams.length)shallowClams[0].clamType=[0,1,2][Math.floor(Math.random()*3)];
      let deepClams=holes.filter(h=>h.kind==='clam'&&h.seaward>.70).sort((a,b)=>b.seaward-a.seaward);
      if(!deepClams.length){const h=holes.slice().sort((a,b)=>b.seaward-a.seaward)[0];makeClam(h);deepClams=[h];}
      deepClams[0].clamType=[4,5,10][Math.floor(Math.random()*3)];
      holes.forEach(h=>h.clueStyle=makeClueStyle(h.kind));
      // At least one ordinary trace perfectly mimics a clam signature, so no
      // single visual combination can become a guaranteed answer.
      const signature=holes.find(h=>h.kind==='clam')?.clueStyle;
      const mimic=holes.find(h=>h.kind!=='clam');
      if(signature&&mimic)mimic.clueStyle={...signature,tilt:rand(-.45,.45)};
    }
    function makeOctopuses(){
      octopuses.length=0;
      const target=Math.max(9,Math.min(18,Math.round(mapW*mapH/100000)));
      for(let attempt=0;attempt<target*70&&octopuses.length<target;attempt++){
        const x=rand(55,mapW-55),y=rand(SAFE_SHORE_Y+95,mapH-70);
        if(octopuses.some(o=>Math.hypot(o.x-x,o.y-y)<105))continue;
        octopuses.push({id:octopuses.length,x,y,size:rand(.72,1.25),angle:rand(-Math.PI,Math.PI),weight:Math.round(rand(380,1250)),caught:false,flooded:false,spottedAt:0,burrowedAt:0,escaped:false});
      }
      if(octopuses.length&&!octopuses.some(o=>Math.hypot(o.x-player.x,o.y-player.y)<260)){
        octopuses[0].x=clamp(player.x+110,55,mapW-55);
        octopuses[0].y=SAFE_SHORE_Y+140;
      }
    }
    function updateNight(now){
      if(!active||mode!=='night'||tideEnded)return;
      for(const o of octopuses){
        if(o.caught||o.flooded||o.escaped)continue;
        if(!o.spottedAt&&hoverX>=0&&inLamp(o.x,o.y)){
          o.spottedAt=now;
          if(!walkTarget&&!digging)setStatus('낙지가 불빛을 느꼈어요! 숨기 전에 위치를 눌러 달려가세요.');
        }
        if(o.spottedAt&&!o.burrowedAt&&now-o.spottedAt>=OCTOPUS_DIVE_DELAY){
          o.burrowedAt=now;
          if(!walkTarget&&!digging)setStatus('낙지가 갯벌에 숨었어요. 남은 흔적으로 달려가 파세요!');
        }
        if(o.burrowedAt&&now-o.burrowedAt>=OCTOPUS_TRACE_TIME){
          o.escaped=true;
          if(!walkTarget&&!digging){setStatus('낙지의 흔적이 사라졌어요. 다른 곳을 비춰 보세요.');updateHud();}
        }
      }
    }
    function fade(age) {
      if (age <= WATER_START) return 1;
      return 1 - clamp((age - WATER_START) / (WATER_END - WATER_START), 0, 1);
    }
    function visible(h, now) { return h.flooded?0:h.reveal * fade(now - h.dugAt); }
    function cutPath(rx, ry, phase) {
      ctx.beginPath();
      for (let i = 0; i <= 36; i++) {
        const a = i / 36 * Math.PI * 2;
        const wobble = 1 + .07 * Math.sin(a * 3 + phase) + .045 * Math.cos(a * 5 - phase);
        const x = Math.cos(a) * rx * wobble, y = Math.sin(a) * ry * wobble;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    function drawCut(c, now) {
      const age = now - c.at;
      if (age > WATER_END) return;
      const wet = clamp((age - WATER_START) / (WATER_END - WATER_START), 0, 1);
      const clear = Math.min(1, age / 210);
      const phase = (c.x1 + c.y1) * .018;
      const pileX = clamp(c.x2 - c.x1, -25, 25) * .24;
      ctx.save();
      ctx.translate(c.x1, c.y1);
      ctx.rotate(clamp((c.x2 - c.x1) / 150, -.22, .22));
      ctx.globalAlpha = clear * (1 - wet * .45);
      ctx.fillStyle = '#a17f60';
      cutPath(31, 21, phase);
      ctx.fill();
      ctx.globalAlpha = clear;
      ctx.fillStyle = '#b58f6c';
      cutPath(26, 17, phase + .4);
      ctx.fill();
      ctx.globalAlpha = clear * (1 - wet);
      ctx.strokeStyle = '#e3bf94';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.ellipse(0, -2, 24, 14, 0, 3.5, 5.6);
      ctx.stroke();
      if (wet > 0) {
        ctx.save();
        cutPath(25, 16, phase + .4);
        ctx.clip();
        const waterline = 16 - 32 * wet;
        ctx.globalAlpha = .74;
        ctx.fillStyle = '#84bbb2';
        ctx.fillRect(-34, waterline, 68, 34);
        ctx.globalAlpha = wet * .5;
        ctx.strokeStyle = '#e1f1dd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-19, waterline + 1);
        ctx.quadraticCurveTo(0, waterline - 2, 19, waterline + 1);
        ctx.stroke();
        ctx.restore();
      }
      if (wet < 1) {
        ctx.globalAlpha = clear * (1 - wet);
        ctx.fillStyle = '#a7805e';
        ctx.beginPath();
        ctx.moveTo(pileX - 18, 24);
        ctx.quadraticCurveTo(pileX - 3, 16, pileX + 16, 23);
        ctx.quadraticCurveTo(pileX + 22, 30, pileX - 18, 28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    function drawSurfaceClue(h,now,alpha){
      const style=h.clueStyle||makeClueStyle('round'),age=now-h.signalAt;
      const detail=clamp((age-180)/880,0,1),pulse=.5+.5*Math.sin(age*.009);
      ctx.save();ctx.rotate(style.tilt||0);
      ctx.globalAlpha=alpha*(.22+.2*pulse);ctx.strokeStyle='#e8ddb2';ctx.lineWidth=1.4;
      for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(0,0,(22+i*10+pulse*3)*h.size,(8+i*4+pulse*2)*h.size,0,0,Math.PI*2);ctx.stroke();}
      ctx.globalAlpha=alpha*(.36+.38*detail);ctx.fillStyle='#8b6c5555';ctx.beginPath();ctx.ellipse(0,1,21*h.size,12*h.size,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#4a4140';ctx.globalAlpha=alpha*(.26+.7*detail);
      if(style.twin){
        for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*style.spread*h.size,0,5.8*h.size,4.2*style.narrow*h.size,side*.13,0,Math.PI*2);ctx.fill();}
      }else{
        ctx.beginPath();ctx.ellipse(0,0,(5.2+style.spread*.22)*h.size,4.2*style.narrow*h.size,0,0,Math.PI*2);ctx.fill();
      }
      if(style.bubbles){
        ctx.fillStyle='#e1f3d7';
        for(let i=0;i<3;i++){const drift=((age*.017+i*12)%27);ctx.globalAlpha=alpha*detail*(1-drift/31)*.72;ctx.beginPath();ctx.arc((-9+i*9)*h.size,-7-drift,1.4+i*.38,0,Math.PI*2);ctx.fill();}
      }
      if(style.suction){
        ctx.strokeStyle='#806851';ctx.lineWidth=1.15;ctx.globalAlpha=alpha*detail*.68;
        for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*29*h.size,side*2);ctx.quadraticCurveTo(side*16*h.size,-side*3,side*8*h.size,0);ctx.stroke();}
      }
      ctx.restore();
    }
    function drawHole(h, now) {
      if(h.flooded)return;
      const x = h.x, y = h.y, size = h.size, reveal = visible(h, now),clue=clueVisibility(h,now),shown=Math.max(reveal,clue);
      if(shown<=.02&&!h.checked)return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(h.angle);
      if(clue>.02&&reveal<=.03&&!h.checked){drawSurfaceClue(h,now,clue);ctx.restore();return;}
      const hintX = h.kind === 'clam' ? 21 : h.kind === 'crab' ? 23 : h.kind === 'pin' ? 14 : 18;
      const hintY = h.kind === 'clam' ? 17 : h.kind === 'crab' ? 12 : 14;
      ctx.globalAlpha=h.checked ? .45 : Math.max(.14,shown);
      ctx.fillStyle = '#8b6c5543';
      ctx.beginPath();
      ctx.ellipse(0, 0, hintX * size, hintY * size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ead0a065';
      ctx.beginPath();
      ctx.ellipse(-3, -4, hintX * .84 * size, hintY * .62 * size, 0, 0, Math.PI * 2);
      ctx.fill();
      if (shown > .03) {
        ctx.globalAlpha = Math.min(1, shown);
        ctx.fillStyle = '#a27d5e';
        ctx.beginPath();
        ctx.ellipse(0, 1, 25 * size, 16 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.pow(shown, 2.1);
        ctx.fillStyle = '#664d44';
        ctx.beginPath();
        ctx.ellipse(0, 1, 18 * size, 12 * size, 0, 0, Math.PI * 2);
        ctx.fill();
        if (h.kind === 'clam') {
          ctx.fillStyle = '#37383d';
          for (const dy of [-6, 6]) {
            ctx.beginPath();
            ctx.ellipse(0, dy * size, 8 * size, 6.5 * size, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = '#b5916b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 10 * size, 15 * size, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (h.kind === 'worm') {
          ctx.fillStyle = '#3e3b3c';
          for (const dx of [-10, 10]) {
            ctx.beginPath();
            ctx.arc(dx * size, 0, 4 * size, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (h.kind === 'crab') {
          ctx.fillStyle = '#3c3b3d';
          ctx.beginPath();
          ctx.ellipse(0, 1, 12 * size, 6 * size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#80624e';
          ctx.lineWidth = 2;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 13 * size, -2 * size);
            ctx.lineTo(side * 27 * size, -8 * size);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = '#393a3c';
          ctx.beginPath();
          ctx.arc(0, 0, (h.kind === 'pin' ? 4 : 9) * size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (h.checked) {
        ctx.globalAlpha = .72;
        ctx.strokeStyle = '#f5e2ae';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 24 * size, -.3, Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawCrab(h, now) {
      if(h.flooded)return;
      const age = now - h.crabAt;
      if (!h.crabAt || age < 0 || age > 1250) return;
      const rise = clamp(age / 220, 0, 1);
      const run = clamp((age - 220) / 720, 0, 1);
      const opacity = rise * clamp((1250 - age) / 260, 0, 1);
      const scale = h.size * .9;
      const x = h.x + h.crabSide * 62 * run * scale;
      const y = h.y + 8 - 21 * rise - 4 * Math.sin(run * Math.PI);
      const step = Math.sin(age * .036) * 2.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = '#684a3d44';
      ctx.beginPath();
      ctx.ellipse(0, 13, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#633f35';
      ctx.lineWidth = 2.3;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const py = -2 + i * 4;
          ctx.beginPath();
          ctx.moveTo(side * 8, py);
          ctx.lineTo(side * (15 + i), py + 3 + step * (i % 2 ? -1 : 1));
          ctx.lineTo(side * (18 + i), py + 8 + step * (i % 2 ? -1 : 1));
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(side * 8, -4);
        ctx.lineTo(side * 16, -9);
        ctx.stroke();
        ctx.fillStyle = '#c77c50';
        ctx.beginPath();
        ctx.ellipse(side * 19, -11, 5, 4, side * .35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#a85e42';
      ctx.strokeStyle = '#694137';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.ellipse(0, 1, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d28a5e';
      ctx.beginPath();
      ctx.ellipse(-2, -2, 7, 3, -.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#633f35';
      ctx.lineWidth = 1.5;
      for (const ex of [-5, 5]) {
        ctx.beginPath();
        ctx.moveTo(ex, -5);
        ctx.lineTo(ex, -12);
        ctx.stroke();
        ctx.fillStyle = '#2f302e';
        ctx.beginPath();
        ctx.arc(ex, -13, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    function drawBasket(now) {
      const sway=player.moving?Math.sin(now*.018+1.4)*2:0;
      ctx.save();
      ctx.translate(-player.face*34,-14+sway);
      // The free hand holds the handle while the other hand keeps the hoe.
      ctx.strokeStyle='#8c6340';ctx.lineWidth=4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(player.face*17,-12);ctx.lineTo(player.face*5,-9);ctx.stroke();
      ctx.strokeStyle='#714929';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(-12,-12);ctx.quadraticCurveTo(0,-36,12,-12);ctx.stroke();
      ctx.fillStyle='#69432d';ctx.beginPath();ctx.ellipse(0,-12,16,6,0,0,Math.PI*2);ctx.fill();
      const drawLittleClam=(item,x,y,angle=0)=>{
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);
        if(item.kind==='octopus'){
          ctx.strokeStyle='#624b6b';ctx.lineWidth=1.5;
          for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*8,Math.sin(a)*8);ctx.stroke();}
          ctx.fillStyle='#8b668f';ctx.beginPath();ctx.arc(0,0,5,0,Math.PI*2);ctx.fill();ctx.restore();return;
        }
        if(item.rainbow){
          const colors=ctx.createLinearGradient(-4,0,4,0);
          for(const [stop,color] of [[0,'#ed514f'],[.25,'#ffd73e'],[.5,'#41c777'],[.75,'#4c9fe4'],[1,'#b17ce0']])colors.addColorStop(stop,color);
          ctx.fillStyle=colors;
        }else ctx.fillStyle=item.color||'#edc795';
        ctx.strokeStyle='#5f4b3a';ctx.lineWidth=1;
        ctx.beginPath();ctx.ellipse(0,0,3.6*(item.width||1),10*(item.length||1),0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.restore();
      };
      const dropping=basketDropAt&&now-basketDropAt<650;
      const settled=dropping?basketItems.slice(0,-1):basketItems;
      const visible=settled.slice(-4);
      visible.forEach((item,i)=>drawLittleClam(item,(i-(visible.length-1)/2)*6.5,-19-(i%2)*2,(i-1.5)*.12));
      if(dropping){
        const t=clamp((now-basketDropAt)/650,0,1);
        const eased=1-(1-t)*(1-t);
        drawLittleClam(basketItems[basketItems.length-1],0,-54+35*eased,-.3*(1-eased));
      }
      // The woven front covers the lower half of the shells.
      ctx.fillStyle='#a7713f';ctx.strokeStyle='#69452d';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(-16,-11);ctx.quadraticCurveTo(-14,7,-10,10);ctx.quadraticCurveTo(0,14,10,10);ctx.quadraticCurveTo(14,7,16,-11);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='#d1a36b';ctx.lineWidth=1;
      for(const y of [-6,0,6]){ctx.beginPath();ctx.moveTo(-14,y);ctx.quadraticCurveTo(0,y+3,14,y);ctx.stroke();}
      for(const x of [-9,-3,3,9]){ctx.beginPath();ctx.moveTo(x,-9);ctx.lineTo(x*.7,9);ctx.stroke();}
      ctx.strokeStyle='#6d492d';ctx.lineWidth=2.4;ctx.beginPath();ctx.ellipse(0,-11,16,5,0,0,Math.PI);ctx.stroke();
      ctx.restore();
    }
    function drawPlayer(now) {
      const bob = player.moving ? Math.sin(now * .018) * 2 : 0;
      const digProgress = digging ? clamp(1 - (digging.until - now) / DIG_DURATION, 0, 1) : 0;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = '#54433655';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(0, bob);
      ctx.fillStyle = '#3b514b';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 9, -5, 7, 11, side * .12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#486b61';
      ctx.beginPath();
      ctx.ellipse(0, -26, 20, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcb37c';
      ctx.beginPath();
      ctx.ellipse(-17, -27, 7, 11, -.25, 0, Math.PI * 2);
      ctx.ellipse(17, -27, 7, 11, .25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d5a46e';
      ctx.beginPath();
      ctx.arc(0, -50, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#55433a';
      ctx.beginPath();
      ctx.arc(-6, -48, 1.7, 0, Math.PI * 2);
      ctx.arc(6, -48, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c49658';
      ctx.beginPath();
      ctx.ellipse(0, -65, 27, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e4ba75';
      ctx.beginPath();
      ctx.ellipse(0, -70, 19, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#746c50';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-16, -65);
      ctx.lineTo(16, -65);
      ctx.stroke();
      if(mode==='night'){
        ctx.fillStyle='#293b43';ctx.fillRect(-13,-66,26,5);
        ctx.fillStyle='#ffe5a0';ctx.beginPath();ctx.arc(0,-65,5,0,Math.PI*2);ctx.fill();
      }
      ctx.save();
      ctx.translate(19 * player.face, -28);
      ctx.rotate(player.face * (digging ? -.8 + Math.sin(digProgress * Math.PI) * 1.7 : .35));
      ctx.strokeStyle = '#70513c';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(11 * player.face, 25);
      ctx.stroke();
      if(mode==='night'){
        ctx.fillStyle='#aab9b3';ctx.strokeStyle='#485e5b';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(8*player.face,24);ctx.lineTo(23*player.face,22);ctx.lineTo(20*player.face,37);ctx.lineTo(13*player.face,40);ctx.closePath();ctx.fill();ctx.stroke();
      }else{
        ctx.fillStyle = '#728079';
        ctx.beginPath();
        ctx.moveTo(6 * player.face, 21);
        ctx.lineTo(19 * player.face, 17);
        ctx.lineTo(24 * player.face, 31);
        ctx.lineTo(10 * player.face, 35);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      drawBasket(now);
      ctx.restore();
    }
    function drawTide(now){
      const tide=tideState(now);
      // The upper strip is the firm shore. Returning here before the timer ends is safe.
      ctx.fillStyle='#d8c39b';ctx.fillRect(0,0,mapW,SAFE_SHORE_Y);
      ctx.strokeStyle='#f3dfb7aa';ctx.lineWidth=4;ctx.setLineDash([18,12]);
      ctx.beginPath();ctx.moveTo(0,SAFE_SHORE_Y);ctx.lineTo(mapW,SAFE_SHORE_Y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#4f6758';ctx.font='700 13px "Malgun Gothic",sans-serif';ctx.fillText('안전한 해안',24,34);
      const profile=fieldProfile(player.y);
      if(profile.depth>.28){
        const pulse=.5+.5*Math.sin(now*.014);
        ctx.globalAlpha=.14+profile.depth*.25;ctx.fillStyle='#bfdaca';
        ctx.beginPath();ctx.ellipse(player.x,player.y+4,20+profile.depth*12+pulse*4,6+profile.depth*4,0,0,Math.PI*2);ctx.fill();
        if(player.moving){
          ctx.strokeStyle='#e2eee0';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(player.x-player.face*13,player.y+7,9+pulse*5,3+pulse*2,0,0,Math.PI*2);ctx.stroke();
        }
        ctx.globalAlpha=1;
      }
      if(tide.flood<=0)return;
      const wave=Math.sin(now*.003)*7;
      const top=tide.waterLine+wave;
      ctx.save();ctx.beginPath();ctx.rect(0,SAFE_SHORE_Y+1,mapW,mapH-SAFE_SHORE_Y);ctx.clip();
      const water=ctx.createLinearGradient(0,top,0,mapH);
      water.addColorStop(0,'#a8ddd1b8');water.addColorStop(.15,'#77bdb6c7');water.addColorStop(1,'#4f9ba4de');
      ctx.fillStyle=water;ctx.fillRect(0,top,mapW,mapH-top+30);
      ctx.strokeStyle='#e9f8dcdd';ctx.lineWidth=4;
      ctx.beginPath();
      for(let x=0;x<=mapW;x+=18){const y=top+Math.sin(x*.025+now*.006)*5;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      ctx.stroke();
      ctx.globalAlpha=.35;ctx.strokeStyle='#d6f4e9';ctx.lineWidth=2;
      for(let row=0;row<4;row++){
        const y=top+35+row*68;
        ctx.beginPath();
        for(let x=(row%2)*25;x<mapW;x+=70){ctx.moveTo(x,y);ctx.quadraticCurveTo(x+20,y-5,x+42,y);}
        ctx.stroke();
      }
      ctx.globalAlpha=1;
      if(tide.wet){
        const pulse=.5+.5*Math.sin(now*.012);
        ctx.strokeStyle=`rgba(230,249,236,${.45+.35*pulse})`;ctx.lineWidth=3;
        ctx.beginPath();ctx.ellipse(player.x,player.y+3,26+8*pulse,10+3*pulse,0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
    function lampDirection(){
      const x=hoverX>=0?hoverX+cameraX:player.x+player.face*170;
      const y=hoverY>=0?hoverY+cameraY:player.y+90;
      return Math.atan2(y-(player.y-48),x-player.x);
    }
    function inLamp(x,y){
      const dx=x-player.x,dy=y-(player.y-48),distance=Math.hypot(dx,dy);
      const angle=lampDirection(),facing=dx*Math.cos(angle)+dy*Math.sin(angle);
      return distance<65||distance<300&&facing/distance>Math.cos(.55);
    }
    function drawOctopus(o,now){
      if(o.caught||o.flooded||o.escaped)return;
      if(o.burrowedAt){
        const left=clamp(1-(now-o.burrowedAt)/OCTOPUS_TRACE_TIME,0,1);
        ctx.save();ctx.translate(o.x,o.y);
        ctx.fillStyle='#523e4ca8';ctx.beginPath();ctx.ellipse(0,0,17*o.size,11*o.size,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=`rgba(245,216,159,${.25+.65*left})`;ctx.lineWidth=2.5;
        ctx.beginPath();ctx.arc(0,0,24*o.size,-Math.PI/2,-Math.PI/2+Math.PI*2*left);ctx.stroke();
        ctx.fillStyle='#d9d2ba';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc((i-1)*8,-10-Math.sin(now*.006+i)*3,1.6,0,Math.PI*2);ctx.fill();}
        ctx.restore();return;
      }
      const bob=Math.sin(now*.003+o.x)*2;
      const sink=o.spottedAt?clamp((now-o.spottedAt-OCTOPUS_DIVE_DELAY+420)/420,0,1):0;
      ctx.save();ctx.translate(o.x,o.y+bob+sink*7);ctx.rotate(o.angle);ctx.scale(o.size*(1-.65*sink),o.size*(1-.65*sink));
      ctx.globalAlpha=1-sink*.55;
      ctx.strokeStyle='#513c56';ctx.lineWidth=4;ctx.lineCap='round';
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4,wiggle=Math.sin(now*(o.spottedAt?.012:.004)+i+o.x)*4;
        ctx.beginPath();ctx.moveTo(Math.cos(angle)*7,Math.sin(angle)*7);
        ctx.quadraticCurveTo(Math.cos(angle)*20+wiggle,Math.sin(angle)*19,Math.cos(angle)*28+wiggle,Math.sin(angle)*30);
        ctx.stroke();
      }
      ctx.fillStyle='#805e84';ctx.beginPath();ctx.ellipse(0,-5,15,18,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#cba5a4';ctx.beginPath();ctx.ellipse(-4,-11,6,4,-.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#f9e6c4';for(const x of [-5,5]){ctx.beginPath();ctx.arc(x,-1,3.2,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#2d3040';for(const x of [-5,5]){ctx.beginPath();ctx.arc(x,-1,1.4,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
    function drawNight(){
      const angle=lampDirection(),x=player.x,y=player.y-48,radius=300;
      ctx.save();ctx.fillStyle='rgba(4,12,24,.91)';ctx.beginPath();ctx.rect(0,0,mapW,mapH);
      ctx.moveTo(x,y);ctx.arc(x,y,radius,angle-.55,angle+.55);ctx.closePath();ctx.fill('evenodd');
      ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,radius,angle-.55,angle+.55);ctx.closePath();ctx.clip();
      const glow=ctx.createRadialGradient(x,y,12,x,y,radius);
      glow.addColorStop(0,'rgba(255,221,149,.26)');glow.addColorStop(.7,'rgba(255,221,149,.10)');glow.addColorStop(1,'rgba(255,221,149,0)');
      ctx.fillStyle=glow;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);ctx.restore();
      ctx.save();ctx.fillStyle='#fff0bd';ctx.shadowColor='#fff0a0';ctx.shadowBlur=18;
      ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    function draw(now) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(-cameraX, -cameraY);
      ctx.drawImage(base, 0, 0, mapW, mapH);
      drawTide(now);
      const tide=tideState(now),front=waterFront(tide,now);
      if(mode==='day'){
        cuts.forEach(c => {if(tide.flood<=0||c.y1+21<front)drawCut(c, now);});
        holes.forEach(h => drawHole(h, now));
        holes.forEach(h => drawCrab(h, now));
      }else{
        cuts.forEach(c => {if(tide.flood<=0||c.y1+21<front)drawCut(c, now);});
        octopuses.forEach(o=>drawOctopus(o,now));
        drawNight();
      }
      if (walkTarget) {
        ctx.strokeStyle = '#eaf3d5bb';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(walkTarget.hole ? walkTarget.hole.x : walkTarget.x, walkTarget.hole ? walkTarget.hole.y : walkTarget.y, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawPlayer(now);
      if (active && hoverX >= 0) {
        const wx = hoverX + cameraX, wy = hoverY + cameraY;
        const h = mode==='day'?hit(wx, wy):nightHit(wx,wy);
        ctx.strokeStyle = h ? '#e9f6cc' : '#fff2d299';
        ctx.lineWidth = h ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(h ? h.x : wx, h ? h.y : wy, h ? 24 * h.size : 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    function renderBasketContents(){
      basketList.replaceChildren();
      if(!basketItems.length){
        const empty=document.createElement('p');empty.textContent=mode==='night'?'아직 비어 있어요. 불빛으로 낙지를 찾아보세요.':'아직 비어 있어요. 맛조개를 캐서 담아 보세요.';basketList.appendChild(empty);
      }
      basketItems.forEach((item,i)=>{
        const row=document.createElement('div');row.className='basket-item';
        const shell=document.createElement('span');shell.className='basket-item-shell';
        shell.style.background=item.rainbow?'linear-gradient(90deg,#ed514f,#ffd73e,#41c777,#4c9fe4,#b17ce0)':item.color;
        if(item.kind==='octopus')shell.style.borderRadius='50% 50% 35% 35%';
        shell.style.width=Math.max(5,Math.round(10*(item.width||1)))+'px';
        shell.style.height=Math.max(10,Math.round(23*(item.length||1)))+'px';
        const name=document.createElement('span');name.textContent=(i+1)+'. '+item.name;
        const weight=document.createElement('strong');weight.textContent=item.weight+'g';
        row.append(shell,name,weight);basketList.appendChild(row);
      });
      basketTotal.textContent='합계 '+basket+'마리 · '+basketWeight+'g';
    }
    function toggleBasket(){
      basketPanel.hidden=!basketPanel.hidden;
      basketText.setAttribute('aria-expanded',String(!basketPanel.hidden));
      if(!basketPanel.hidden)renderBasketContents();
    }
    basketText.addEventListener('click',toggleBasket);
    function updateHud() {
      basketText.textContent = '바구니 ' + basket + '마리 · ' + basketWeight + 'g · 보기';
      if(!basketPanel.hidden)renderBasketContents();
      if(mode==='night'){
        count.textContent='낙지 '+basket+'마리 채집 · 놓침 '+misses+' · 남은 기척 '+octopuses.filter(o=>!o.caught&&!o.flooded&&!o.escaped).length;
        zoneText.textContent='밤 간조 · 헤드랜턴 탐색';
        return;
      }
      const activeClues=holes.filter(h=>clueVisibility(h,performance.now())>.12).length;
      count.textContent = '확인 ' + strokes + '곳 · 놓친 기척 ' + clueClosures + ' · 주변 기척 ' + activeClues;
      const profile=fieldProfile(player.y),speed=Math.round(profile.speedFactor*100),chance=Math.round(profile.clamChance*100);
      const text=profile.zone+' · '+profile.activity+' · 이동 '+speed+'% · 맛조개 '+chance+'%';
      if(zoneText.textContent!==text)zoneText.textContent=text;
    }
    function hit(x, y) {
      let nearest = null, best = Infinity;
      for (const h of holes) {
        if(h.flooded)continue;
        if(!h.checked&&!h.locked&&clueVisibility(h,performance.now())<.14)continue;
        const distance = Math.hypot(h.x - x, h.y - y);
        if (distance < 26 * h.size && distance < best) { nearest = h; best = distance; }
      }
      return nearest;
    }
    function nightHit(x,y){
      return octopuses.find(o=>!o.caught&&!o.flooded&&!o.escaped&&inLamp(o.x,o.y)&&Math.hypot(o.x-x,o.y-y)<27*o.size)||null;
    }
    function beginNightDig(o,now){
      if(!o||o.caught||o.flooded||digging||transitioning)return;
      walkTarget=null;player.moving=false;player.face=o.x>=player.x?1:-1;
      digging={octopus:o,until:now+OCTOPUS_DIG_DURATION};
      cuts.push({x1:o.x,y1:o.y,x2:o.x+8,y2:o.y+24,at:now});
      setStatus('낙지가 숨은 자리를 빠르게 파고 있어요!');
    }
    function finishNightDig(o,now){
      strokes++;
      if(!o.escaped&&!o.flooded&&(!o.burrowedAt||now-o.burrowedAt<OCTOPUS_TRACE_TIME)){
        o.caught=true;found++;basket++;basketWeight+=o.weight;
        basketItems.push({kind:'octopus',name:'낙지',color:'#8b668f',length:.8,width:1.3,weight:o.weight});
        basketDropAt=now;
        setStatus('낙지를 파내 바구니에 담았어요! 다음 낙지를 찾아보세요.');
      }else{
        o.escaped=true;misses++;
        setStatus('조금 늦었어요. 낙지가 깊이 숨어 빈자리만 남았어요.');
      }
      updateHud();
    }
    function choose(x, y) {
      const now = performance.now();
      if (!active || transitioning) return;
      const h = hit(x, y);
      if(h?.flooded)return;
      if (h && h.checked) { setStatus('이미 살펴본 구멍이에요. 다른 흔적을 찾아보세요.'); return; }
      strokes++;
      const atX = h ? h.x : x, atY = h ? h.y : y;
      cuts.push({x1: atX, y1: atY, x2: atX + 8, y2: atY + 24, at: now});
      if (!h) {
        misses++;
        setStatus('빈 갯벌이었어요. 다른 흔적을 찾아보세요.');
      } else {
        h.locked=false;h.signalAt=0;h.signalUntil=0;
        h.reveal = 1;
        h.dugAt = now;
        if (h.kind === 'clam') {
          activeHole = h;
          found++;
          transitioning = true;
          setStatus('붙은 타원형 구멍입니다! 가까이서 소금을 뿌려 보세요.');
          const current = generation;
          setTimeout(() => {
            if (!active || current !== generation || h.flooded) return;
            close();
            onFound(h.clamType, h.weightFactor, h.pullEvent);
          }, 550);
        } else {
          checked++;
          misses++;
          h.checked = true;
          if (h.kind === 'crab') { h.crabAt = now; h.crabSide = h.x < mapW / 2 ? 1 : -1; }
          setStatus(h.kind === 'crab' ? '작은 게가 나와 옆으로 달아났어요. 다른 구멍을 찾아보세요.' :
            h.kind === 'worm' ? '떨어진 작은 구멍 둘이었어요. 다른 곳을 살펴보세요.' :
              h.kind === 'pin' ? '작은 점 구멍이었어요. 다른 곳을 살펴보세요.' :
                '둥근 구멍 하나였어요. 다른 곳을 살펴보세요.');
        }
      }
      updateHud(now);
      draw(now);
    }
    function beginDig(h, now) {
      if (digging || transitioning || h.checked || h.flooded) return;
      h.locked=true;
      walkTarget = null;
      player.moving = false;
      player.face = h.x >= player.x ? 1 : -1;
      digging = {hole: h, until: now + DIG_DURATION};
      setStatus('호미로 바로 확인합니다!');
    }
    function nearestHole() {
      let nearest = null, distance = Infinity;
      for (const h of holes) {
        if(h.flooded)continue;
        const d = Math.hypot(h.x - player.x, h.y - player.y);
        if (!h.checked && (h.locked||clueVisibility(h,performance.now())>.14) && d < distance) { nearest = h; distance = d; }
      }
      return distance <= 72 ? nearest : null;
    }
    function fieldClick(sx, sy) {
      if (!active || digging || transitioning) return;
      const x = sx + cameraX, y = sy + cameraY;
      if(Math.hypot(x-(player.x-player.face*34),y-(player.y-14))<21){toggleBasket();return;}
      if(mode==='night'){
        const o=nightHit(x,y);
        if(o){
          if(Math.hypot(o.x-player.x,o.y-player.y)<=78)beginNightDig(o,performance.now());
          else{walkTarget={x:clamp(o.x,20,mapW-20),y:clamp(o.y+55,PLAYER_TOP_Y,mapH-20),octopus:o};setStatus('낙지가 곧 숨습니다! 흔적이 사라지기 전에 달려가 파세요.');}
        }else{
          walkTarget={x:clamp(x,20,mapW-20),y:clamp(y,PLAYER_TOP_Y,mapH-20)};
          setStatus('헤드랜턴으로 갯벌을 비추며 낙지를 찾아보세요.');
        }
        return;
      }
      const h = hit(x, y);
      if (h && h.checked) { setStatus('이미 살펴본 구멍이에요. 다른 흔적을 찾아보세요.'); return; }
      if (h) {
        if(walkTarget?.hole&&walkTarget.hole!==h)walkTarget.hole.locked=false;
        h.locked=true;
        walkTarget = {x: clamp(h.x - 24, 20, mapW - 20), y: clamp(h.y + 28, 25, mapH - 20), hole: h};
        setStatus('사라지기 전에 기척을 붙잡았어요. 가까이 가서 팝니다.');
      } else {
        if(walkTarget?.hole)walkTarget.hole.locked=false;
        walkTarget = {x: clamp(x, 20, mapW - 20), y: clamp(y, 25, mapH - 20), hole: null};
        setStatus('갯벌을 걸으며 기포와 모래 움직임을 찾아보세요.');
      }
    }
    function updatePlayer(now, dt) {
      if (digging) {
        if (now >= digging.until) {
          const h = digging.hole;
          const o = digging.octopus;
          digging = null;
          if(o)finishNightDig(o,now);
          else choose(h.x, h.y);
        }
        return;
      }
      let vx = 0, vy = 0;
      if (keys.has('arrowleft') || keys.has('a')) vx--;
      if (keys.has('arrowright') || keys.has('d')) vx++;
      if (keys.has('arrowup') || keys.has('w')) vy--;
      if (keys.has('arrowdown') || keys.has('s')) vy++;
      if (vx || vy) walkTarget = null;
      else if (walkTarget) {
        const dx = walkTarget.x - player.x, dy = walkTarget.y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 5) {
          const h = walkTarget.hole;
          const o = walkTarget.octopus;
          walkTarget = null;
          player.moving = false;
          if (h) beginDig(h, now);
          if(o)beginNightDig(o,now);
          return;
        }
        vx = dx / distance;
        vy = dy / distance;
      }
      const length = Math.hypot(vx, vy);
      player.moving = length > 0;
      if (length) {
        const speed=WALK_SPEED*movementFactor(now)*(mode==='night'&&walkTarget?.octopus?1.28:1);
        player.x = clamp(player.x + vx / length * speed * dt, 20, mapW - 20);
        player.y = clamp(player.y + vy / length * speed * dt, PLAYER_TOP_Y, mapH - 20);
        if (vx) player.face = vx > 0 ? 1 : -1;
        updateHud();
      }
      updateCamera();
    }
    canvas.addEventListener('pointerdown', e => {
      if (!active || e.button !== 0) return;
      down = true;
      pointerId = e.pointerId;
      downX = hoverX = e.clientX;
      downY = hoverY = e.clientY;
      moved = 0;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      hoverX = e.clientX; hoverY = e.clientY;
      if (down && pointerId === e.pointerId) moved = Math.hypot(hoverX - downX, hoverY - downY);
      canvas.style.cursor = (mode==='night'?nightHit(hoverX+cameraX,hoverY+cameraY):hit(hoverX + cameraX, hoverY + cameraY))||Math.hypot(hoverX+cameraX-(player.x-player.face*34),hoverY+cameraY-(player.y-14))<21 ? 'pointer' : 'crosshair';
      draw(performance.now());
    });
    canvas.addEventListener('pointerup', e => {
      if (!down || pointerId !== e.pointerId) return;
      down = false;
      pointerId = null;
      if (moved < 12) fieldClick(downX, downY);
    });
    canvas.addEventListener('pointercancel', () => { down = false; pointerId = null; });
    canvas.addEventListener('pointerleave', () => { if (!down) { hoverX = -100; draw(performance.now()); } });
    addEventListener('keydown', e => {
      if (!active || e.ctrlKey || e.altKey || e.metaKey || e.target.matches('input,button')) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        keys.add(key);
        e.preventDefault();
      } else if (key === 'e' || key === ' ') {
        if (!e.repeat) {
          if(mode==='night'){
            const o=octopuses.find(o=>!o.caught&&!o.flooded&&!o.escaped&&inLamp(o.x,o.y)&&Math.hypot(o.x-player.x,o.y-player.y)<78);
            if(o)beginNightDig(o,performance.now());
            else setStatus('불빛 속의 낙지 흔적 가까이에서 E를 눌러 파세요.');
          }else{
            const h = nearestHole();
            if (h) beginDig(h, performance.now());
            else setStatus('구멍 가까이 다가간 뒤 파 보세요.');
          }
        }
        e.preventDefault();
      }
    });
    addEventListener('keyup', e => { keys.delete(e.key.toLowerCase()); });
    addEventListener('blur', () => { keys.clear(); });
    function tick(now) {
      const dt = lastTick ? clamp((now - lastTick) / 1000, 0, .05) : 0;
      lastTick = now;
      updateTide(now);
      updateNight(now);
      if(active&&!tideEnded)updateClues(now);
      if(active&&!tideEnded)updatePlayer(now, dt);
      if (active&&now - frameAt > 25) {
        frameAt = now;
        while (cuts.length && now - cuts[0].at > WATER_END) cuts.shift();
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    }
    function start(message, options = {}) {
      const fresh = options.fresh || !hasField;
      if (fresh) {
        mode=options.mode||mode;
        cuts.length = 0;
        player.x = mapW / 2;
        player.y = PLAYER_TOP_Y;
        player.face = 1;
        if(mode==='night'){holes.length=0;makeOctopuses();}
        else{octopuses.length=0;makeHoles();}
        found = 0;
        checked = 0;
        strokes = 0;
        misses = 0;
        basket = 0;
        basketWeight = 0;
        basketItems.length = 0;
        basketDropAt = 0;
        surveyMarks.length=0;clueSightings=0;clueClosures=0;lastQuietAt=0;nextClueAt=performance.now()+650;
        hasField = true;
        activeHole = null;
        tideStartedAt=performance.now();tideElapsedOverride=null;tideEnded=false;lastTidePhase='low';lastTideHudAt=0;
      } else if (activeHole) {
        activeHole.locked=false;activeHole.signalAt=0;activeHole.signalUntil=0;
        if (options.outcome === 'caught' || options.outcome === 'escaped') {
          activeHole.checked = true;
          checked++;
          if (options.outcome === 'caught') {
            basket++;
            basketWeight += options.weight || 0;
            basketItems.push({...options.clam,weight:options.weight||0});
            basketDropAt = performance.now();
          }
        }
        activeHole = null;
      }
      active = true;
      overlay.dataset.mode=mode;
      modeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
      searchTitle.textContent=mode==='night'?'헤드랜턴으로 낙지를 찾아요':'잠깐 나타나는 기척을 찾아봐요';
      searchHint.innerHTML=mode==='night'?'헤드랜턴으로 발견 <span>·</span> 낙지/흔적 클릭: 달려가 파기 <span>·</span> 가까이서 E: 파기':'기척 클릭: 다가가 파기 <span>·</span> 빈 곳 클릭: 이동 <span>·</span> WASD / 방향키: 걷기';
      tideHud.querySelector('.tide-icon').textContent=mode==='night'?'☾':'◔';
      overlay.hidden = false;
      document.body.classList.add('searching');
      tideResult.hidden=true;
      basketPanel.hidden = true;basketText.setAttribute('aria-expanded','false');
      generation++;
      transitioning = false;
      player.moving = false;
      updateCamera();
      down = false;
      walkTarget = null;
      digging = null;
      keys.clear();
      lastTick = 0;
      hoverX = -100; hoverY = -100;
      if(!fresh)nextClueAt=Math.min(nextClueAt||Infinity,performance.now()+300);
      setStatus(message || (mode==='night'?'헤드랜턴 불빛으로 낙지를 찾고 가까이서 잡아 보세요.':'기포와 빨려 드는 모래가 나타나면, 구멍이 닫히기 전에 눌러 보세요.'));
      updateHud();
      draw(performance.now());
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function close() {
      active = false;
      overlay.hidden = true;
      document.body.classList.remove('searching');
      keys.clear();
      if(walkTarget?.hole)walkTarget.hole.locked=false;
      walkTarget = null;
      digging = null;
    }
    modeButtons.forEach(button=>button.addEventListener('click',()=>{
      if(button.dataset.mode===mode)return;
      start(undefined,{fresh:true,mode:button.dataset.mode});
    }));
    tideResultButton.addEventListener('click',()=>start(mode==='night'?'새 밤 간조가 시작됐어요. 헤드랜턴으로 낙지를 찾아보세요.':'새 간조가 시작됐어요. 물이 돌아오기 전에 맛조개를 찾아보세요.',{fresh:true,newTide:true}));
    addEventListener('resize', resize);
    resize();
    return {start, close, getState: () => ({
      active, mode, found, checked, strokes, misses, basket, basketWeight, basketItems:basketItems.map(item=>({...item})),octopuses:octopuses.length,remainingOctopuses:octopuses.filter(o=>!o.caught&&!o.flooded&&!o.escaped).length, player: {x: player.x, y: player.y}, camera: {x: cameraX, y: cameraY}, walking: !!walkTarget, digging: !!digging,
      tide:tideState(performance.now()),tideEnded,field:{...fieldProfile(player.y),movementFactor:movementFactor(performance.now()),localPressure:surveyPressure(player.x,player.y,performance.now())},
      revealed: holes.filter(h => visible(h, performance.now()) >= .34).length,
      clues:{active:holes.filter(h=>clueVisibility(h,performance.now())>.12).length,sightings:clueSightings,closed:clueClosures},
      holes: holes.length, clamHoles: holes.filter(h => h.kind === 'clam').length, floodedHoles:holes.filter(h=>h.flooded).length
    }), setTideElapsed:(ms)=>{tideElapsedOverride=clamp(ms,0,TIDE_END);lastTideHudAt=0;updateTide(performance.now());if(active&&!tideEnded)draw(performance.now());}, getDebugHoles: () => holes.map(h => ({
      id:h.id,x: h.x - cameraX, y: h.y - cameraY, worldX: h.x, worldY: h.y, kind: h.kind,clueStyle:{...h.clueStyle}, clamType: h.clamType, rarity:h.clamType===undefined?null:TYPE_RARITY[h.clamType],weightFactor: h.weightFactor, pullEvent: h.pullEvent,seaward:h.seaward,clamChance:h.clamChance,speedFactor:h.speedFactor,reveal: visible(h, performance.now()),clue:clueVisibility(h,performance.now()),signalAt:h.signalAt,signalUntil:h.signalUntil,locked:h.locked,checked:h.checked,flooded:h.flooded
    })),getDebugOctopuses:()=>octopuses.map(o=>({id:o.id,x:o.x-cameraX,y:o.y-cameraY,worldX:o.x,worldY:o.y,spotted:!!o.spottedAt,burrowed:!!o.burrowedAt,escaped:o.escaped,caught:o.caught,flooded:o.flooded})),triggerClue};
  };
})();
