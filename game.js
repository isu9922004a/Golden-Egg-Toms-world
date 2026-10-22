/* Lucky Eggs 2.0.0 — original mobile arcade simulation based on three user-provided videos.
   IMPORTANT: probabilities and scoring are self-defined; they are NOT obtained from the arcade machine. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ui = {
    app:$('app'),scene:$('scene'),info:$('sceneInfo'),message:$('stageMessage'),
    jackpot:$('jackpotValue'),score:$('scoreValue'),gold:$('goldValue'),time:$('timeValue'),
    timeCell:document.querySelector('.time-cell'),tickets:$('ticketValue'),gems:$('gemValue'),
    combo:$('comboValue'),modeLabel:$('modeLabel'),progress:$('roundProgress'),
    start:$('startButton'),sound:$('audioButton'),help:$('helpButton'),best:$('bestValue'),
    flash:$('centerFlash'),countdown:$('bigCountdown'),reward:$('rewardStage'),
    rewardHero:$('rewardHero'),rewardKicker:$('rewardKicker'),rewardTitle:$('rewardTitle'),
    rewardValue:$('rewardValue'),rewardSubtitle:$('rewardSubtitle'),ticketRain:$('ticketRain'),
    modal:$('modalLayer'),title:$('modalTitle'),lead:$('modalLead'),
    desc:$('modalDescription'),deco:$('modalDeco'),stats:$('modalStats'),
    modeChooser:$('modeChooser'),modalAction:$('modalAction'),secondary:$('modalSecondary'),
    share:$('modalShare'),note:$('modalFootnote'),toast:$('toast'),
    canvas:$('particleCanvas'),tips:$('consoleTip'),
    eggs:[...document.querySelectorAll('.egg-button')],
    spots:[...document.querySelectorAll('.stage-spot')],
    choices:[...document.querySelectorAll('.mode-choice')]
  };
  const CONFIG = {
    classic:{name:'經典挑戰',ms:60_000,interval:1500,delay:260,window:1550},
    rush:{name:'極速狂歡',ms:45_000,interval:990,delay:190,window:1020}
  };
  const SAVE_KEY='lucky-eggs-mobile-v2';
  const DEFAULT_NOTE='影片可觀察到遊戲流程，但原機獎率與公式無法確認。本版純娛樂、無付費與實體兌獎。';
  const state={
    phase:'idle',mode:'classic',sound:true,best:0,jackpot:410,
    plays:0,wins:0,score:0,tickets:0,gems:0,gold:0,
    hits:0,misses:0,combo:0,maxCombo:0,roundMs:60_000,remaining:60_000,
    target:-1,lastTarget:-1,nextTargetAt:0,targetExpires:0,
    endAt:0,countdownAt:0,countDisplay:0,locked:false,winPending:false,
    lastWrongAt:0,modalKind:'intro',lastReward:'',lastEvent:'準備好就開始',
    rewards:{golden:0,ticket:0,gem:0,lucky:0,coin:0,bomb:0}
  };
  let frame=0,animationTimer=0,flashTimer=0,toastTimer=0,feedbackTimer=0;
  let audioContext=null;let random=Math.random;
  let particles=[],particleFrame=0,cw=0,ch=0;
  const paint=ui.canvas.getContext('2d');

  function safeSave(){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify({sound:state.sound,best:state.best,jackpot:state.jackpot,mode:state.mode,plays:state.plays,wins:state.wins}));}catch(_){/* private tabs */}
  }
  function load(){
    try{
      const data=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
      const old=JSON.parse(localStorage.getItem('lucky-eggs-mobile-v1')||'{}');
      if(typeof data.sound==='boolean')state.sound=data.sound;
      if(Number.isFinite(data.best))state.best=Math.max(0,Math.min(9999999,Math.round(data.best)));
      else if(Number.isFinite(old.best))state.best=Math.max(0,Math.round(old.best));
      if(Number.isFinite(data.jackpot))state.jackpot=Math.max(410,Math.min(999999,data.jackpot));
      if(CONFIG[data.mode])state.mode=data.mode;
      if(Number.isFinite(data.plays))state.plays=Math.max(0,Math.round(data.plays));
      if(Number.isFinite(data.wins))state.wins=Math.max(0,Math.round(data.wins));
    }catch(_){/* missing storage */}
  }
  const SOUNDS={
    countdown:[[440,0,.12,'sine']],go:[[523,0,.10],[659,.11,.11],[880,.24,.2]],
    hit:[[660,0,.06,'triangle'],[950,.065,.08]],
    miss:[[190,0,.12,'triangle']],
    ticket:[[520,0,.10],[730,.09,.12],[1050,.21,.20]],
    gem:[[800,0,.09],[1120,.12,.15],[1450,.25,.17]],
    gold:[[470,0,.10],[620,.13,.10],[820,.25,.12],[1240,.40,.27]],
    draw:[[550,0,.08],[700,.1,.09],[850,.20,.10],[1080,.33,.22]],
    win:[[523,0,.18],[659,.16,.18],[784,.32,.22],[1046,.5,.46]],
    over:[[330,0,.20],[270,.2,.20],[196,.4,.30]]
  };
  function sfx(key){
    if(!state.sound)return;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    try{
      audioContext=audioContext||new AC();
      if(audioContext.state==='suspended')void audioContext.resume();
      const t=audioContext.currentTime;
      for(const [freq,offset,len,wave='sine'] of (SOUNDS[key]||[])){
        const osc=audioContext.createOscillator(),gain=audioContext.createGain();
        osc.type=wave;osc.frequency.setValueAtTime(freq,t+offset);
        gain.gain.setValueAtTime(.0001,t+offset);
        gain.gain.exponentialRampToValueAtTime(.045,t+offset+.012);
        gain.gain.exponentialRampToValueAtTime(.0001,t+offset+len);
        osc.connect(gain);gain.connect(audioContext.destination);
        osc.start(t+offset);osc.stop(t+offset+len+.015);
      }
    }catch(_){/* audio is optional */}
  }
  function buzz(pattern=16){try{navigator.vibrate?.(pattern);}catch(_){}}
  function render(){
    ui.jackpot.textContent=String(state.jackpot);
    ui.score.textContent=String(state.score).padStart(4,'0');
    ui.gold.textContent=String(state.gold);
    ui.tickets.textContent=String(state.tickets);
    ui.gems.textContent=String(state.gems);
    ui.combo.textContent=String(state.combo);
    ui.time.textContent=String(Math.max(0,Math.ceil(state.remaining/1000)));
    ui.best.textContent=String(state.best);
    ui.modeLabel.textContent=`${CONFIG[state.mode].name} · ${Math.round(CONFIG[state.mode].ms/1000)} 秒`;
    ui.progress.style.width=`${(100*(1-state.remaining/state.roundMs)).toFixed(2)}%`;
    ui.sound.textContent=state.sound?'🔊':'🔇';
    ui.sound.setAttribute('aria-label',state.sound?'關閉遊戲音效':'開啟遊戲音效');
    ui.timeCell.classList.toggle('urgent',state.phase==='playing'&&state.remaining<=10_000);
    const phases={playing:'Ⅱ 暫停',paused:'▶ 繼續',countdown:'準備中…',prize:'🎉 開獎中',idle:'▶ 開始遊戲',result:'▶ 再玩一次'};
    ui.start.textContent=phases[state.phase]||'▶ 開始遊戲';
    ui.start.disabled=state.phase==='countdown';
    ui.eggs.forEach((btn,index)=>{
      const lit=state.phase==='playing'&&index===state.target;
      btn.classList.toggle('lit',lit);
      btn.classList.toggle('active-target',lit);
      btn.setAttribute('aria-label',`${index+1} 號金蛋${lit?'，正在發光':''}`);
    });
    ui.spots.forEach((spot,index)=>spot.classList.toggle('active',state.phase==='playing'&&index===state.target));
  }
  function feedback(message,ms=1500){
    state.lastEvent=message;ui.message.textContent=message;
    clearTimeout(feedbackTimer);
    feedbackTimer=setTimeout(()=>{
      if(state.phase==='playing')ui.message.textContent='集滿 3 隻金雞，挑戰超級大獎！';
    },ms);
  }
  function toast(message){
    ui.toast.textContent=message;ui.toast.classList.add('visible');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('visible'),1300);
  }
  function flash(emoji,label){
    clearTimeout(flashTimer);
    ui.flash.querySelector('.flash-egg').textContent=emoji;
    ui.flash.querySelector('.flash-label').textContent=label;
    ui.flash.classList.remove('show');void ui.flash.offsetWidth;ui.flash.classList.add('show');
    flashTimer=setTimeout(()=>ui.flash.classList.remove('show'),680);
  }
  function hideEffects(){
    clearTimeout(animationTimer);animationTimer=0;
    clearTimeout(flashTimer);ui.flash.classList.remove('show');
    ui.reward.hidden=true;ui.countdown.hidden=true;
  }
  function cancelFrame(){if(frame){cancelAnimationFrame(frame);frame=0;}}
  function showDialog(kind,opts){
    state.modalKind=kind;
    ui.title.textContent=opts.title;
    ui.lead.textContent=opts.lead||'LUCKY EGGS';
    ui.deco.textContent=opts.deco||'✨ 🥚 ✨';
    ui.desc.innerHTML=opts.description||''; // only static developer authored content
    ui.modeChooser.hidden=!opts.chooser;
    ui.stats.hidden=!opts.stats;
    if(opts.stats)ui.stats.innerHTML=opts.stats;
    ui.modalAction.textContent=opts.action||'▶ 開始遊戲';
    ui.secondary.hidden=!opts.secondary;ui.secondary.textContent=opts.secondary||'';
    ui.share.hidden=!opts.share;
    ui.note.textContent=opts.note||DEFAULT_NOTE;
    ui.modal.hidden=false;
  }
  function hideDialog(){ui.modal.hidden=true;}
  function selectMode(mode){
    if(!CONFIG[mode])return;
    state.mode=mode;safeSave();
    ui.choices.forEach(btn=>{
      const chosen=btn.dataset.mode===mode;
      btn.classList.toggle('selected',chosen);
      btn.setAttribute('aria-pressed',chosen?'true':'false');
    });
    if(state.phase==='idle'||state.phase==='result'){
      state.roundMs=CONFIG[mode].ms;state.remaining=state.roundMs;render();
    }
  }
  function intro(){
    state.phase='idle';state.target=-1;state.remaining=CONFIG[state.mode].ms;
    state.roundMs=state.remaining;hideEffects();cancelFrame();render();
    ui.info.textContent='看準亮起的金蛋，立即點擊！';
    ui.tips.textContent='下方六顆金蛋都能點擊遊玩';
    showDialog('intro',{
      title:'砸金蛋',lead:'LUCKY EGGS · 街機手機版 V2',
      description:'看準亮起的金蛋，快速點擊！<br>收集 <b>3 隻金雞</b>，挑戰超級大獎。<br>增加 <b>獎券、寶石、幸運大抽獎</b> 等演出。',
      chooser:true,action:'🥚 開始砸金蛋',secondary:'先看看遊戲畫面'
    });
  }
  function resetRound(){
    hideEffects();cancelFrame();
    Object.assign(state,{
      score:0,tickets:0,gems:0,gold:0,hits:0,misses:0,combo:0,maxCombo:0,
      roundMs:CONFIG[state.mode].ms,remaining:CONFIG[state.mode].ms,
      target:-1,lastTarget:-1,nextTargetAt:0,targetExpires:0,
      endAt:0,countdownAt:0,countDisplay:0,locked:false,winPending:false,lastWrongAt:0,
      rewards:{golden:0,ticket:0,gem:0,lucky:0,coin:0,bomb:0}
    });
    ui.eggs.forEach(btn=>btn.classList.remove('cracked','missed'));
    ui.reward.hidden=true;
  }
  function begin(){
    resetRound();state.plays++;safeSave();
    hideDialog();state.phase='countdown';
    state.countdownAt=performance.now()+3000;state.countDisplay=4;
    ui.info.textContent='準備開始！對應金蛋位置敲擊';
    ui.tips.textContent='三、二、一，準備敲金蛋！';
    feedback('準備好敲擊發光金蛋！',3100);
    ui.countdown.hidden=false;
    render();cancelFrame();frame=requestAnimationFrame(tick);
  }
  function startActive(now){
    state.phase='playing';state.endAt=now+state.remaining;state.nextTargetAt=now+310;
    ui.countdown.hidden=true;ui.info.textContent='金蛋亮起時立即敲擊！';
    ui.tips.textContent='看螢幕閃光位置，再點下方金蛋';
    sfx('go');buzz([16,40,16]);render();
  }
  function spawn(now){
    let target=Math.floor(random()*6);
    if(target===state.lastTarget)target=(target+1+Math.floor(random()*5))%6;
    state.target=target;state.lastTarget=target;
    const cfg=CONFIG[state.mode];
    const speedup=Math.min(.24,state.hits*.006);
    state.targetExpires=now+cfg.window*(1-speedup)+(random()-.5)*180;
    state.nextTargetAt=0;
    ui.info.textContent=`亮起第 ${target+1} 顆！快敲！`;
    render();
  }
  function tick(now){
    frame=0;
    if(state.phase==='countdown'){
      const remaining=Math.max(0,state.countdownAt-now);
      const n=Math.ceil(remaining/1000);
      if(n<=0){startActive(now);}else if(n!==state.countDisplay){
        state.countDisplay=n;ui.countdown.textContent=n;
        ui.countdown.style.animation='none';void ui.countdown.offsetWidth;ui.countdown.style.animation='';
        sfx('countdown');render();
      }
    }
    if(state.phase==='playing'){
      state.remaining=Math.max(0,state.endAt-now);
      if(state.remaining<=0){finish(false);return;}
      if(state.target>=0&&now>=state.targetExpires){
        state.target=-1;state.combo=0;
        state.nextTargetAt=now+CONFIG[state.mode].delay;
        feedback('沒打到！下一顆準備出現');
      }
      if(state.target<0&&now>=state.nextTargetAt)spawn(now);
      else render();
    }
    if(state.phase==='playing'||state.phase==='countdown')frame=requestAnimationFrame(tick);
  }
  function updateScore(amount){
    state.score=Math.max(0,state.score+amount);
    if(state.score>state.best){state.best=state.score;safeSave();}
  }
  function pause(){
    if(!['playing','countdown','prize'].includes(state.phase))return;
    if(state.phase==='playing')state.remaining=Math.max(0,state.endAt-performance.now());
    // For simplicity, a paused countdown restarts the 3-2-1 intro on resume.
    state.phase='paused';state.target=-1;hideEffects();cancelFrame();render();
    showDialog('pause',{
      title:'暫停遊戲',lead:'PAUSED',deco:'⏸ 🥚 ⏸',
      description:`得分 <b>${state.score}</b> · 獎券 <b>${state.tickets}</b> 張<br>金雞 <b>${state.gold}/3</b> · 剩餘 <b>${Math.ceil(state.remaining/1000)}</b> 秒`,
      action:'▶ 繼續遊戲',secondary:'結束本局'
    });
  }
  function resume(){
    if(state.phase!=='paused')return;
    if(state.winPending){hideDialog();finish(true);return;}
    hideDialog();state.target=-1;state.phase='countdown';
    state.countDisplay=4;state.countdownAt=performance.now()+3000;
    ui.countdown.hidden=false;
    ui.info.textContent='準備繼續遊戲';render();cancelFrame();frame=requestAnimationFrame(tick);
  }
  function resizeCanvas(){
    const r=ui.app.getBoundingClientRect();const dpr=Math.min(2,devicePixelRatio||1);
    cw=r.width;ch=r.height;ui.canvas.width=Math.max(1,Math.round(cw*dpr));
    ui.canvas.height=Math.max(1,Math.round(ch*dpr));
    paint?.setTransform(dpr,0,0,dpr,0,0);
  }
  function sparks(color,count,index=null){
    if(!paint)return;
    if(!cw)resizeCanvas();
    const app=ui.app.getBoundingClientRect();
    const origin=index==null?ui.scene.getBoundingClientRect():ui.eggs[index].getBoundingClientRect();
    const ox=origin.left-app.left+origin.width/2;
    const oy=origin.top-app.top+origin.height*(index==null?.52:.5);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const n=reduced?Math.min(count,8):count;
    for(let i=0;i<n;i++){
      const a=random()*Math.PI*2,sp=1.1+random()*4;
      particles.push({x:ox,y:oy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2.7,s:1.8+random()*4.6,
        life:40+random()*35,color,angle:random()*6,spin:(random()-.5)*.3});
    }
    if(!particleFrame)particleFrame=requestAnimationFrame(paintParticles);
  }
  function paintParticles(){
    particleFrame=0;if(!paint)return;
    paint.clearRect(0,0,cw,ch);particles=particles.filter(p=>p.life>0);
    particles.forEach(p=>{
      paint.save();paint.translate(p.x,p.y);paint.rotate(p.angle);
      paint.globalAlpha=Math.min(1,p.life/21);paint.fillStyle=p.color;
      paint.fillRect(-p.s/2,-p.s/2,p.s,p.s*.72);paint.restore();
      p.x+=p.vx;p.y+=p.vy;p.vy+=.12;p.vx*=.99;p.life--;p.angle+=p.spin;
    });
    if(particles.length)particleFrame=requestAnimationFrame(paintParticles);
  }
  function createTickets(){
    ui.ticketRain.replaceChildren();
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
    const amount=18;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<amount;i++){
      const item=document.createElement('span');item.className='ticket-piece';
      item.style.left=(random()*100)+'%';item.style.animationDelay=(-random()*.5)+'s';
      item.style.setProperty('--fall',(1.3+random()*1.5)+'s');
      fragment.appendChild(item);
    }
    ui.ticketRain.appendChild(fragment);
  }
  /** Runs a short, non-interactive prize animation, freezing the game clock fairly. */
  function showPrize({hero='🥚',kicker='LUCKY EGGS',title='幸運開獎',value='',subtitle='',duration=1600,after}){
    if(state.phase!=='playing')return;
    const now=performance.now();state.remaining=Math.max(0,state.endAt-now);
    state.phase='prize';state.target=-1;cancelFrame();
    ui.rewardHero.textContent=hero;ui.rewardKicker.textContent=kicker;
    ui.rewardTitle.textContent=title;ui.rewardValue.textContent=value;
    ui.rewardSubtitle.textContent=subtitle;ui.reward.hidden=false;
    createTickets();render();
    animationTimer=setTimeout(()=>{
      ui.reward.hidden=true;animationTimer=0;
      if(typeof after==='function')after();
      if(state.phase==='prize')continueAfterPrize();
    },duration);
  }
  function continueAfterPrize(){
    if(state.winPending){finish(true);return;}
    state.phase='playing';state.endAt=performance.now()+state.remaining;
    state.nextTargetAt=performance.now()+220;state.target=-1;
    render();cancelFrame();frame=requestAnimationFrame(tick);
  }
  function reward(name,index){
    // All weights belong to this independently authored simulation, not the filmed arcade machine.
    const roll=random();
    if(roll<.155){
      state.gold++;state.rewards.golden++;updateScore(150+state.combo*3);
      sfx('gold');buzz([18,50,25]);sparks('#ffe36a',44,index);
      feedback(`🎉 獲得第 ${state.gold} 隻金雞！`);
      if(state.gold===3){
        state.winPending=true;
        showPrize({hero:'🐤',kicker:'SUPER JACKPOT',title:'集滿三隻金雞！',value:`+${state.jackpot}`,subtitle:'超級大獎分數',duration:1900});
      }else showPrize({hero:'🐤',title:'幸運金雞！',value:`${state.gold} / 3`,subtitle:'再集金雞，挑戰超級大獎',duration:1200});
    }else if(roll<.36){
      state.rewards.ticket++;
      const values=[6,12,18,24,36,54],weights=[.2,.23,.22,.18,.11,.06];
      const num=weighted(values,weights);state.tickets+=num;updateScore(num*2);
      feedback(`🎟 恭喜獲得 ${num} 張獎券！`);sfx('ticket');sparks('#fff1a8',32,index);
      if(num>=24)showPrize({hero:'🥚',kicker:'LUCKY TICKET',title:'金蛋開獎',value:`${num}`,subtitle:'TICKETS · 恭喜獲得',duration:1550});
      else flash('🎟',`+${num} 張獎券`);
    }else if(roll<.53){
      state.rewards.gem++;
      const amount=1+Math.floor(random()*3);
      state.gems+=amount;updateScore(amount*36);
      feedback(`💎 送寶石啦！寶石 +${amount}`);sfx('gem');sparks('#91faff',35,index);
      showPrize({hero:'💎',kicker:'DIAMOND REWARD',title:'送寶石啦！',value:`+${amount}`,subtitle:'璀璨寶石',duration:1250});
    }else if(roll<.65){
      state.rewards.lucky++;sfx('draw');
      const drawTickets=weighted([12,24,36,54],[.35,.30,.25,.10]);
      state.tickets+=drawTickets;updateScore(drawTickets*3);
      feedback(`✨ 幸運大抽獎！獲得 ${drawTickets} 張獎券`);
      sparks('#ffdc83',46,index);
      showPrize({hero:'🎫',kicker:'LUCKY DRAW',title:'幸運大抽獎',value:`${drawTickets}`,subtitle:'張虛擬獎券',duration:1950});
    }else if(roll<.72){
      state.rewards.bomb++;state.combo=0;
      updateScore(-25);feedback('💥 空蛋！扣除 25 分');
      flash('💥','空蛋 −25');sfx('miss');buzz(40);
      sparks('#ff66af',14,index);
    }else{
      state.rewards.coin++;const amount=20+Math.min(60,state.combo*5);
      updateScore(amount);feedback(`🪙 金幣分數 +${amount}`);
      sfx('hit');flash('🪙',`+${amount}`);sparks('#ffca68',22,index);
    }
  }
  function weighted(values,weights){
    let v=random();for(let i=0;i<values.length;i++){v-=weights[i];if(v<=0)return values[i];}
    return values[values.length-1];
  }
  function hit(index){
    if(state.phase!=='playing'){
      if(state.phase==='idle'&&ui.modal.hidden)intro();
      else if(state.phase==='prize')toast('正在開獎，請看螢幕！');
      return;
    }
    const now=performance.now();
    if(state.target!==index||now>state.targetExpires){
      if(now-state.lastWrongAt<300)return;
      state.lastWrongAt=now;state.misses++;state.combo=0;
      const btn=ui.eggs[index];btn.classList.add('missed');
      setTimeout(()=>btn.classList.remove('missed'),280);
      feedback('⚠ 敲錯了！找亮起的金蛋');sfx('miss');buzz(10);render();return;
    }
    state.target=-1;state.hits++;state.combo++;
    state.maxCombo=Math.max(state.maxCombo,state.combo);
    state.nextTargetAt=now+CONFIG[state.mode].delay;
    ui.eggs[index].classList.add('cracked');
    setTimeout(()=>ui.eggs[index].classList.remove('cracked'),450);
    buzz(18);reward('egg',index);
    if(state.combo>0&&state.combo%5===0&&state.phase==='playing'){
      const extra=40+state.combo*2;updateScore(extra);
      feedback(`🔥 ${state.combo} 連擊！BONUS +${extra}`);
      sparks('#ffe878',26,index);
    }
    render();
  }
  function finish(win,quit=false){
    if(state.phase==='result')return;
    cancelFrame();hideEffects();
    if(state.phase==='playing')state.remaining=Math.max(0,state.endAt-performance.now());
    if(win){state.wins++;updateScore(state.jackpot);state.jackpot+=20;state.winPending=false;sfx('win');buzz([30,60,30,60,60]);sparks('#fff3a1',120);}
    else if(!quit){state.remaining=0;sfx('over');}
    state.target=-1;state.phase='result';safeSave();render();
    ui.info.textContent=win?'超級大獎！挑戰成功！':'挑戰結束！';
    ui.tips.textContent='完成本局！點下方按鈕再挑戰';
    feedback(win?'🎉 集滿三隻金雞！':'⏰ 本回合結束！',99999);
    const accuracy=(state.hits+state.misses)?Math.round(100*state.hits/(state.hits+state.misses)):0;
    const desc=win?'<b>恭喜集滿 3 隻金雞！</b> 已獲得超級大獎的虛擬分數。':
      quit?'你選擇提前結束本局。':'倒數結束！繼續挑戰金雞與幸運大抽獎。';
    showDialog('result',{
      title:win?'🏆 超級大獎！':quit?'本局已結束':'⏰ 時間到！',
      lead:win?'SUPER JACKPOT':'GAME OVER',deco:win?'🎊 🐤 🎊':'✨ 🥚 ✨',
      description:desc,
      stats:`<span>🏆 得分 ${state.score}</span><span>🎟 獎券 ${state.tickets}</span><span>💎 寶石 ${state.gems}</span><span>🐤 金雞 ${state.gold}/3</span><span>💥 命中 ${state.hits}</span><span>🎯 命中率 ${accuracy}%</span><span>🔥 最長連擊 ${state.maxCombo}</span><span>✨ 抽獎 ${state.rewards.lucky} 次</span>`,
      action:'🥚 再玩一局',secondary:'回到主畫面',share:true
    });
  }
  function help(){
    if(['playing','countdown','prize'].includes(state.phase))pause();
    showDialog('help',{
      title:'遊戲說明',lead:'HOW TO PLAY',deco:'🕹️ 🥚 🎟',
      description:'① <b>3、2、1</b> 倒數後開始敲蛋。<br>② 六顆蛋輪流發光，立即敲擊下方對應位置。<br>③ 獎勵包含 <b>獎券、寶石、金雞、空蛋</b>。<br>④ 觸發 <b>幸運大抽獎</b> 會停錶播放開獎動畫。<br>⑤ 收集 <b>3 隻金雞</b> 即成功，剩餘時間結束則結算。<br>⑥ 電腦可用 <b>1～6</b> 數字鍵，空白鍵暫停。',
      action:state.phase==='paused'?'▶ 返回繼續':'🥚 開始新遊戲',
      secondary:state.phase==='paused'?'結束本局':'返回主畫面',
      note:'遊戲時間、出蛋速度、加分公式、中獎機率均為手機版自行設計；僅參考使用者三部實拍影片可見的互動、視覺與開獎流程。'
    });
  }
  async function share(){
    const summary=`砸金蛋 Lucky Eggs V2\n模式：${CONFIG[state.mode].name}\n得分：${state.score}\n獎券：${state.tickets}｜寶石：${state.gems}\n金雞：${state.gold}/3｜最大連擊：${state.maxCombo}\n免費娛樂試玩，無真實兌獎。`;
    try{
      if(navigator.share){await navigator.share({title:'砸金蛋 V2 成績',text:summary});return;}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(summary);toast('已複製成績，可貼到 LINE！');return;}
      const t=document.createElement('textarea');t.value=summary;t.style.position='fixed';t.style.left='-9999px';
      document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();toast('已複製成績文字！');
    }catch(err){if(err?.name!=='AbortError')toast('分享失敗，可截圖遊戲成績');}
  }
  function bind(){
    ui.eggs.forEach(btn=>{
      btn.addEventListener('click',()=>hit(Number(btn.dataset.index)));
      btn.addEventListener('contextmenu',e=>e.preventDefault());
    });
    ui.start.addEventListener('click',()=>{
      if(state.phase==='playing')pause();
      else if(state.phase==='paused')resume();
      else if(state.phase==='idle'||state.phase==='result')begin();
      else if(state.phase==='prize')toast('幸運大抽獎進行中！');
    });
    ui.sound.addEventListener('click',()=>{state.sound=!state.sound;safeSave();render();if(state.sound)sfx('hit');});
    ui.help.addEventListener('click',help);
    ui.choices.forEach(btn=>btn.addEventListener('click',()=>selectMode(btn.dataset.mode)));
    ui.modalAction.addEventListener('click',()=>{
      if(state.modalKind==='pause'||(state.modalKind==='help'&&state.phase==='paused'))resume();
      else begin();
    });
    ui.secondary.addEventListener('click',()=>{
      if(state.phase==='paused'){finish(false,true);}
      else if(state.modalKind==='intro'){hideDialog();}
      else intro();
    });
    ui.share.addEventListener('click',share);
    window.addEventListener('keydown',e=>{
      if(e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
      if(/^[1-6]$/.test(e.key)){e.preventDefault();hit(+e.key-1);}
      if(e.code==='Space'){e.preventDefault();
        if(state.phase==='playing')pause();else if(state.phase==='paused')resume();
        else if(state.phase==='idle'||state.phase==='result')begin();
      }
      if(e.key==='Escape'&&state.phase==='playing')pause();
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&['playing','countdown','prize'].includes(state.phase))pause();
    });
    window.addEventListener('resize',resizeCanvas,{passive:true});
    window.addEventListener('pagehide',()=>{if(state.phase==='playing')pause();});
    if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  load();state.roundMs=CONFIG[state.mode].ms;state.remaining=state.roundMs;
  selectMode(state.mode);resizeCanvas();render();bind();intro();
  // Console-only hook for deterministic local QA. No external service or network connection.
  if(location.protocol==='file:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'){
    window.__LUCKY_EGGS_TEST__={getState:()=>({...state,rewards:{...state.rewards}}),
      forceTarget:(i=0)=>{if(state.phase==='playing'){state.target=i;state.targetExpires=performance.now()+4000;render();}},
      forceReward:(r)=>{const map={gold:.03,ticket:.23,gem:.42,draw:.58,bomb:.70,coin:.90};if(r in map){const orig=random;random=()=>map[r];try{hit(state.target<0?0:state.target);}finally{random=orig;}}},
      setRemaining:(ms)=>{if(state.phase==='playing'){state.remaining=ms;state.endAt=performance.now()+ms;render();}},
      skipCountdown:()=>{if(state.phase==='countdown')startActive(performance.now());}
    };
  }
})();
