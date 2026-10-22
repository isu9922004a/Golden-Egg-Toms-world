'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const els = {
    app:$('app'),scene:$('scene'),sceneInfo:$('sceneInfo'),stageMessage:$('stageMessage'),
    jackpot:$('jackpotValue'),score:$('scoreValue'),gold:$('goldValue'),time:$('timeValue'),
    timeCell:document.querySelector('.time-cell'),credit:$('creditValue'),best:$('bestValue'),
    progress:$('roundProgress'),start:$('startButton'),addCoin:$('addCoinButton'),
    sound:$('audioButton'),help:$('helpButton'),flash:$('centerFlash'),
    modal:$('modalLayer'),modalTitle:$('modalTitle'),modalLead:$('modalLead'),
    modalDesc:$('modalDescription'),modalStats:$('modalStats'),
    modalAction:$('modalAction'),modalSecondary:$('modalSecondary'),modalFootnote:$('modalFootnote'),
    canvas:$('particleCanvas'),tips:$('consoleTip'),
    buttons:Array.from(document.querySelectorAll('.egg-button')),
    spots:Array.from(document.querySelectorAll('.stage-spot'))
  };
  const STORE_KEY = 'lucky-eggs-mobile-v1';
  const DURATION = 60_000;
  const state = {
    mode:'idle',previousMode:'idle',credits:5,jackpot:410,best:0,sound:true,
    score:0,gold:0,hits:0,misses:0,combo:0,maxCombo:0,seconds:60,
    activeIndex:-1,lastIndex:-1,targetDeadline:0,nextSpawnAt:0,endAt:0,
    remaining:DURATION,lastWrongAt:0,locked:false,won:false,sessionNumber:0
  };
  let raf=0,flashTimer=0,feedbackTimer=0,audioContext=null;
  let particles=[],particleFrame=0,canvasWidth=0,canvasHeight=0;
  const ctx=els.canvas.getContext('2d');

  function persist(){
    try{localStorage.setItem(STORE_KEY,JSON.stringify({credits:state.credits,best:state.best,jackpot:state.jackpot,sound:state.sound}));}catch(e){}
  }
  function load(){
    try{
      const obj=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
      if(Number.isFinite(obj.credits))state.credits=Math.max(0,Math.min(99,Math.round(obj.credits)));
      if(Number.isFinite(obj.best))state.best=Math.max(0,Math.floor(obj.best));
      if(Number.isFinite(obj.jackpot))state.jackpot=Math.max(410,Math.floor(obj.jackpot));
      if(typeof obj.sound==='boolean')state.sound=obj.sound;
    }catch(e){}
  }
  function playAudio(notes){
    if(!state.sound)return;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    try{
      audioContext=audioContext||new Audio();
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
      const time=audioContext.currentTime;
      for(const [frequency,offset,length,wave='sine'] of notes){
        const osc=audioContext.createOscillator(),gain=audioContext.createGain();
        osc.type=wave;osc.frequency.setValueAtTime(frequency,time+offset);
        gain.gain.setValueAtTime(.0001,time+offset);
        gain.gain.exponentialRampToValueAtTime(.055,time+offset+.018);
        gain.gain.exponentialRampToValueAtTime(.0001,time+offset+length);
        osc.connect(gain);gain.connect(audioContext.destination);
        osc.start(time+offset);osc.stop(time+offset+length+.015);
      }
    }catch(e){}
  }
  const SOUND={
    start:[[392,0,.12],[494,.10,.12],[587,.20,.12],[784,.30,.24]],
    hit:[[720,0,.07,'triangle'],[440,.07,.08],[860,.13,.13]],
    gold:[[600,0,.12],[780,.11,.12],[960,.24,.14],[1200,.39,.22]],
    miss:[[214,0,.12,'sawtooth'],[147,.10,.12,'sawtooth']],
    bomb:[[170,0,.3,'sawtooth'],[95,.1,.35,'triangle']],
    win:[[524,0,.18],[659,.16,.18],[784,.32,.18],[1046,.48,.44]],
    end:[[395,0,.21],[300,.19,.21],[220,.38,.35]]
  };
  function haptic(pattern=20){if(navigator.vibrate)navigator.vibrate(pattern);}
  function render(){
    els.jackpot.textContent=state.jackpot;
    els.score.textContent=String(Math.max(0,state.score)).padStart(4,'0');
    els.gold.textContent=state.gold;
    els.time.textContent=Math.max(0,Math.ceil(state.remaining/1000));
    els.timeCell.classList.toggle('urgent',state.mode==='playing'&&state.remaining<=10_000);
    els.credit.textContent=state.credits;
    els.best.textContent=state.best;
    els.sound.textContent=state.sound?'🔊':'🔇';
    els.start.textContent=state.mode==='playing'?'Ⅱ 暫停':state.mode==='paused'?'▶ 繼續':'▶ 開始遊戲';
    els.progress.style.width=`${100*(1-state.remaining/DURATION)}%`;
    els.buttons.forEach((button,index)=>button.classList.toggle('lit',index===state.activeIndex&&state.mode==='playing'));
    els.spots.forEach((spot,index)=>spot.classList.toggle('active',index===state.activeIndex&&state.mode==='playing'));
  }
  function clearTarget(){state.activeIndex=-1;render();}
  function spawn(now){
    if(state.mode!=='playing')return;
    let index=Math.floor(Math.random()*6);
    if(index===state.lastIndex)index=(index+1+Math.floor(Math.random()*5))%6;
    state.activeIndex=index;state.lastIndex=index;
    // Vary the timing slightly to reproduce the quick arcade-light rhythm.
    state.targetDeadline=now+1250+(Math.random()-.5)*260;
    state.nextSpawnAt=0;
    els.sceneInfo.textContent='發光金蛋出現了！快敲！';
    render();
  }
  function tick(now){
    if(state.mode!=='playing')return;
    state.remaining=Math.max(0,state.endAt-now);
    if(state.remaining===0){finish(false);return;}
    if(state.activeIndex>=0&&now>=state.targetDeadline){
      state.activeIndex=-1;
      state.combo=0;
      state.nextSpawnAt=now+230;
      els.sceneInfo.textContent='錯過了！注意下一顆';
    }
    if(state.activeIndex===-1&&now>=state.nextSpawnAt)spawn(now);
    else render();
    raf=requestAnimationFrame(tick);
  }
  function showOverlay({title,lead,description,button,secondary='',stats='',footnote='純娛樂試玩，不提供真實金錢或獎品。'}){
    els.modalTitle.textContent=title;
    els.modalLead.textContent=lead;
    els.modalDesc.innerHTML=description;
    els.modalAction.textContent=button;
    els.modalSecondary.hidden=!secondary;
    els.modalSecondary.textContent=secondary;
    els.modalStats.hidden=!stats;
    if(stats)els.modalStats.innerHTML=stats;
    els.modalFootnote.textContent=footnote;
    els.modal.hidden=false;
  }
  function closeOverlay(){els.modal.hidden=true;}
  function resetRound(){
    state.sessionNumber++;
    state.score=0;state.gold=0;state.hits=0;state.misses=0;
    state.combo=0;state.maxCombo=0;state.remaining=DURATION;
    state.lastIndex=-1;state.activeIndex=-1;state.lastWrongAt=0;
    state.locked=false;state.won=false;
    clearTimeout(flashTimer);clearTimeout(feedbackTimer);
    els.flash.classList.remove('show');
    els.buttons.forEach(b=>b.classList.remove('cracked','missed'));
  }
  function begin(){
    if(state.mode==='playing')return;
    if(state.credits<=0){state.credits=1;}
    state.credits--;
    resetRound();
    state.mode='playing';state.previousMode='playing';
    state.endAt=performance.now()+DURATION;
    state.nextSpawnAt=performance.now()+600;
    els.sceneInfo.textContent='準備好… 金蛋要亮起囉！';
    els.stageMessage.textContent='集滿 3 隻金雞，就能挑戰超級大獎！';
    els.tips.textContent='快點發光的金蛋！';
    closeOverlay();persist();render();
    playAudio(SOUND.start);haptic([18,40,18]);
    cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
  }
  function pause(){
    if(state.mode!=='playing')return;
    state.remaining=Math.max(0,state.endAt-performance.now());
    state.mode='paused';state.activeIndex=-1;
    cancelAnimationFrame(raf);render();
    showOverlay({title:'遊戲暫停',lead:'PAUSED',description:`目前得分 <b>${state.score}</b>，已獲得 <b>${state.gold} / 3</b> 隻金雞。<br>按「繼續遊戲」會恢復剩下的 <b>${Math.ceil(state.remaining/1000)}</b> 秒。`,button:'▶ 繼續遊戲',secondary:'結束本局'});
  }
  function resume(){
    if(state.mode!=='paused')return;
    state.mode='playing';state.endAt=performance.now()+state.remaining;
    state.nextSpawnAt=performance.now()+320;
    state.targetDeadline=0;state.activeIndex=-1;
    els.sceneInfo.textContent='繼續！敲擊發亮金蛋';
    closeOverlay();render();cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);
  }
  function updateScore(points){
    state.score=Math.max(0,state.score+points);
    if(state.score>state.best){state.best=state.score;persist();}
  }
  function feedback(message){
    els.stageMessage.textContent=message;
    clearTimeout(feedbackTimer);
    feedbackTimer=setTimeout(()=>{
      if(state.mode==='playing')els.stageMessage.textContent='收集 3 隻金雞，挑戰超級大獎！';
    },1500);
  }
  function burstEmoji(emoji,label){
    clearTimeout(flashTimer);
    els.flash.querySelector('.flash-egg').textContent=emoji;
    els.flash.querySelector('.flash-label').textContent=label;
    els.flash.classList.remove('show');
    void els.flash.offsetWidth;
    els.flash.classList.add('show');
    flashTimer=setTimeout(()=>els.flash.classList.remove('show'),710);
  }
  function hit(index){
    if(state.mode!=='playing'){
      if(state.mode==='idle')showOverlay({title:'準備砸金蛋！',lead:'LUCKY EGGS',description:'點「開始砸金蛋」即可免費試玩。<br>亮起哪顆金蛋，就快速點哪顆。',button:'🥚 開始砸金蛋'});
      return;
    }
    const now=performance.now();
    if(state.activeIndex!==index){
      if(now-state.lastWrongAt<370)return;
      state.lastWrongAt=now;state.misses++;state.combo=0;
      const button=els.buttons[index];button.classList.add('missed');
      setTimeout(()=>button.classList.remove('missed'),260);
      feedback('沒有亮喔！要敲發光的金蛋');
      playAudio(SOUND.miss);haptic(9);
      return;
    }
    if(now>state.targetDeadline)return;
    clearTarget();state.hits++;state.combo++;
    state.maxCombo=Math.max(state.maxCombo,state.combo);
    state.nextSpawnAt=now+390;
    const button=els.buttons[index];button.classList.add('cracked');
    setTimeout(()=>button.classList.remove('cracked'),490);
    const roll=Math.random();
    // Golden chickens are intentionally rare; hitting the target never guarantees a jackpot.
    if(roll<.12){
      state.gold++;
      updateScore(125+Math.min(80,state.combo*5));
      burstEmoji('🐤','金雞 +1！');
      feedback(`恭喜！找到第 ${state.gold} 隻金雞！`);
      spawnParticles('#ffe874',42,index);playAudio(SOUND.gold);haptic([20,35,35]);
      if(state.gold>=3){
        state.won=true;state.jackpot+=100;
        updateScore(410);
        render();finish(true);return;
      }
    }else if(roll<.19){
      updateScore(-30);
      state.combo=0;
      burstEmoji('💣','炸彈 -30');feedback('碰到炸彈！扣 30 分');
      spawnParticles('#fc599e',19,index);playAudio(SOUND.bomb);haptic([40,40,40]);
    }else if(roll<.42){
      updateScore(60+Math.min(60,state.combo*3));
      burstEmoji('💎','寶石 +60');feedback('閃耀寶石！額外加分');
      spawnParticles('#69f9ff',26,index);playAudio(SOUND.hit);haptic(19);
    }else if(roll<.68){
      updateScore(40+Math.min(50,state.combo*4));
      burstEmoji('⭐','幸運星 +40');feedback(`連擊 ${state.combo} 次！`);
      spawnParticles('#ffe875',22,index);playAudio(SOUND.hit);haptic(19);
    }else{
      updateScore(20+Math.min(60,state.combo*4));
      burstEmoji('🪙','金幣 +20');feedback(`敲中了！連擊 ${state.combo}`);
      spawnParticles('#ffbe35',20,index);playAudio(SOUND.hit);haptic(19);
    }
    if(state.combo&&state.combo%6===0){updateScore(80);feedback(`${state.combo} 連擊 BONUS +80！`);}
    render();
  }
  function finish(won){
    state.mode='result';state.won=won;
    cancelAnimationFrame(raf);state.activeIndex=-1;
    if(!won)state.remaining=0;
    els.sceneInfo.textContent=won?'挑戰成功！超級大獎！':'本回合結束';
    els.stageMessage.textContent=won?'🎉 收集到 3 隻金雞！':'再挑戰一次，集滿 3 隻金雞！';
    render();persist();
    if(won){spawnParticles('#ffe46e',150,null);playAudio(SOUND.win);haptic([30,50,30,50,90]);}
    else playAudio(SOUND.end);
    const title=won?'🎉 超級大獎！':'⏰ 時間到！';
    showOverlay({
      title,lead:won?'JACKPOT CHALLENGE COMPLETE':'GAME OVER · 再接再厲',
      description:won?'恭喜你集滿 <b>3 隻金雞</b>，完成手機版砸金蛋挑戰！':'已完成本局挑戰，還差 '+Math.max(0,3-state.gold)+' 隻金雞。',
      stats:`<span>🏆 得分 ${state.score}</span><span>🐤 金雞 ${state.gold}/3</span><span>💥 命中 ${state.hits}</span><span>🔥 最長連擊 ${state.maxCombo}</span>`,
      button:'🥚 再玩一局',secondary:'返回主畫面'
    });
  }
  function showHelp(){
    if(state.mode==='playing')pause();
    const playing=state.mode==='paused';
    state.previousMode=state.mode;
    showOverlay({title:'遊戲說明',lead:'HOW TO PLAY',description:
      '① 點「開始遊戲」，進行 <b>60 秒</b> 挑戰。<br>② 六顆大金蛋會輪流亮起，<b>立刻點亮起的那顆</b>。<br>③ 有機會獲得金幣、寶石、幸運星、炸彈及金雞。<br>④ <b>收集 3 隻金雞</b>即可過關。<br>⑤ 電腦可按 <b>1～6</b> 敲蛋。',
      button:playing?'▶ 繼續遊戲':'🥚 開始遊戲',secondary:playing?'結束本局':'返回',footnote:'參考使用者提供的街機影片改作；實際獎品種類、機率與原機未必相同。'});
  }
  function resizeCanvas(){
    const rect=els.app.getBoundingClientRect();
    canvasWidth=rect.width;canvasHeight=rect.height;
    const dpr=Math.min(2,window.devicePixelRatio||1);
    els.canvas.width=Math.round(canvasWidth*dpr);els.canvas.height=Math.round(canvasHeight*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function spawnParticles(color,count,index){
    if(!ctx)return;
    if(!canvasWidth)resizeCanvas();
    let originX=canvasWidth/2,originY=canvasHeight*.47;
    if(index!=null){
      const button=els.buttons[index];const rect=button.getBoundingClientRect();const appRect=els.app.getBoundingClientRect();
      originX=rect.left-appRect.left+rect.width/2;
      originY=rect.top-appRect.top+rect.height/2;
    }
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,speed=1.1+Math.random()*5.6;
      particles.push({x:originX,y:originY,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed-3.7,size:2+Math.random()*5,color,life:65+Math.random()*55,rotation:Math.random()*6,spin:(Math.random()-.5)*.2});
    }
    if(!particleFrame)particleFrame=requestAnimationFrame(drawParticles);
  }
  function drawParticles(){
    particleFrame=0;
    if(!ctx)return;
    ctx.clearRect(0,0,canvasWidth,canvasHeight);
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){
      ctx.save();ctx.globalAlpha=Math.min(1,p.life/34);
      ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
      ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.64);
      ctx.restore();p.x+=p.vx;p.y+=p.vy;p.vy+=.11;p.vx*=.99;p.rotation+=p.spin;p.life--;
    }
    if(particles.length)particleFrame=requestAnimationFrame(drawParticles);
  }
  function initial(){
    load();resizeCanvas();render();
    els.buttons.forEach(button=>{
      button.addEventListener('click',()=>hit(Number(button.dataset.index)));
      button.addEventListener('contextmenu',event=>event.preventDefault());
    });
    els.start.addEventListener('click',()=>{
      if(state.mode==='playing')pause();
      else if(state.mode==='paused')resume();
      else begin();
    });
    els.addCoin.addEventListener('click',()=>{state.credits=Math.min(99,state.credits+1);persist();render();playAudio([[660,0,.06],[880,.08,.11]]);});
    els.sound.addEventListener('click',()=>{state.sound=!state.sound;persist();render();if(state.sound)playAudio(SOUND.hit);});
    els.help.addEventListener('click',showHelp);
    els.modalAction.addEventListener('click',()=>{if(state.mode==='paused')resume();else begin();});
    els.modalSecondary.addEventListener('click',()=>{
      if(state.mode==='paused'){
        state.mode='result';state.activeIndex=-1;render();
        showOverlay({title:'本局已結束',lead:'READY FOR NEXT ROUND',description:'可以重新開始挑戰收集 3 隻金雞。',button:'🥚 再玩一局',secondary:'返回主畫面'});
      }else if(state.mode==='result'||state.mode==='idle'){
        state.mode='idle';state.activeIndex=-1;state.remaining=DURATION;render();closeOverlay();
      }
    });
    window.addEventListener('keydown',event=>{
      const i=Number(event.key)-1;
      if(event.repeat)return;
      if(i>=0&&i<6&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();hit(i);}
      if(event.code==='Space'){
        event.preventDefault();
        if(state.mode==='playing')pause();else if(state.mode==='paused')resume();else begin();
      }
      if(event.key==='Escape'&&state.mode==='playing')pause();
    });
    // A hidden browser tab pauses gameplay instead of unfairly exhausting the timer.
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&state.mode==='playing')pause();
    });
    window.addEventListener('resize',resizeCanvas,{passive:true});
    if('serviceWorker'in navigator&&location.protocol!=='file:'){
      window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }
  }
  initial();
})();
