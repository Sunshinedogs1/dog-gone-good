(function(){
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const STORAGE_KEY = 'pawsitive_trainer_v1';
  const defaultData = { dogName:'', settings:{ theme:'system', fontScale:100, enableHints:true }, progress:[], badges:[] };

  const MODULES = [
    { id:'sit', name:'Sit', steps:['Hold treat above nose','Mark when rear touches ground','Fade lure','Add verbal cue','Generalize'], criteria:['Latency ≤ 2s','10/10 reps','Hold 2s'] },
    { id:'down', name:'Down', steps:['Lure nose down','Mark elbows hit floor','Fade lure','Add cue','Build duration'], criteria:['Latency ≤ 3s','8/10 reps','Hold 3s'] },
    { id:'stay', name:'Stay', steps:['Flat hand + say Stay','Start 1s','Increase duration→distance→distraction','Reset criteria if errors'], criteria:['Hold 5s at 1 step','No creeping 8/10','Recovers after reset'] },
    { id:'come', name:'Recall (Come)', steps:['Name + Come','Mark movement to you','Back up playfully','Add mild distractions'], criteria:['Turns head on cue','Arrives quickly','8/10 indoors'] },
    { id:'leave', name:'Leave It', steps:['Present item in closed fist','Mark disengage','Progress to open hand','Add cue "Leave it"'], criteria:['Disengages ≤ 2s','Ignores open palm','Can do with dropped kibble (on leash)'] },
    { id:'loose', name:'Loose-Leash Walking', steps:['Reinforce slack leash','High rate of reinforcement','Turn frequently','Add duration'], criteria:['5–10 loose steps','Checks in','Handles mild distractions'] },
    { id:'drop', name:'Drop It', steps:['Offer treat while dog holds toy','Mark mouth opens','Trade up','Add cue'], criteria:['Releases ≤ 2s','No guarding','Happily trades'] }
  ];

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultData); } catch { return structuredClone(defaultData); } };
  const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  let state = load();

  const quickModuleSel = $('#quickModule');
  const sessionModuleSel = $('#sessionModule');
  const sessionDurationInput = $('#sessionDuration');
  const sessionStartBtn = $('#sessionStart');
  const sessionStopBtn = $('#sessionStop');
  const sessionMarkBtn = $('#sessionMark');
  const timeLeftEl = $('#timeLeft');
  const repCountEl = $('#repCount');
  const notesEl = $('#sessionNotes');
  const moduleList = $('#moduleList');
  const playClickBtn = $('#playClick');
  const badgesEl = $('#badges');
  const streakEl = $('#streak');
  const totalSessionsEl = $('#totalSessions');
  const historyEl = $('#history');

  $$('.tab-button').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.tab-button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab').forEach(t=>t.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  }));

  function populateModuleSelects(){
    [quickModuleSel, sessionModuleSel].forEach(sel=>{ sel.innerHTML = MODULES.map(m=>`<option value="${m.id}">${m.name}</option>`).join(''); });
  }
  function renderModules(){
    moduleList.innerHTML = MODULES.map(m=>{
      const steps = m.steps.map(s=>`<li>${s}</li>`).join('');
      const crit = m.criteria.map(c=>`<li>${c}</li>`).join('');
      return `<article class="module-card"><h3>${m.name}</h3><p><strong>Criteria</strong></p><ul>${crit}</ul><details><summary>Steps</summary><ol>${steps}</ol></details><button data-start-module="${m.id}">Start ${m.name}</button></article>`;
    }).join('');
    Array.from(document.querySelectorAll('#modules [data-start-module]')).forEach(btn=>btn.addEventListener('click',()=>{ sessionModuleSel.value = btn.dataset.startModule; document.querySelector('[data-tab="session"]').click(); }));
  }

  let audioCtx; function clickSound(){ try { audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); o.type='square'; o.frequency.setValueAtTime(1500, audioCtx.currentTime); g.gain.setValueAtTime(0.0001,audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.2,audioCtx.currentTime+0.01); g.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+0.06); o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.08);} catch(e){} }
  playClickBtn.addEventListener('click', clickSound);

  function computeStreak(){ const days=new Set(state.progress.map(p=>p.date)); if(days.size===0) return 0; const today=new Date(); let s=0; for(let i=0;i<365;i++){ const d=new Date(today); d.setDate(today.getDate()-i); const key=d.toISOString().slice(0,10); if(days.has(key)) s++; else break; } return s; }
  function updateBadges(){ const total=state.progress.length; const streak=computeStreak(); const b=[]; if(total>=1) b.push('First Session'); if(total>=10) b.push('10 Sessions'); if(streak>=3) b.push('3-Day Streak'); if(streak>=7) b.push('7-Day Streak'); badgesEl.innerHTML = b.map(x=>`<span class="badge">🏅 ${x}</span>`).join(''); }
  function renderProgress(){ totalSessionsEl.textContent = `📊 Total sessions: ${state.progress.length}`; streakEl.textContent = `🔥 Streak: ${computeStreak()} days`; historyEl.innerHTML = state.progress.slice().reverse().slice(0,50).map(p=>`<div>${p.date} — <strong>${MODULES.find(m=>m.id===p.module)?.name||p.module}</strong> — ${p.reps} reps — ${p.duration}s${p.notes?` — Notes: ${p.notes}`:''}</div>`).join(''); updateBadges(); }

  let timer=null, remaining=0, reps=0;
  function startSession(){ remaining=Math.max(30, Math.min(600, parseInt(sessionDurationInput.value)||90)); reps=0; timeLeftEl.textContent=remaining; repCountEl.textContent=reps; sessionStartBtn.disabled=true; sessionStopBtn.disabled=false; sessionMarkBtn.disabled=false; timer=setInterval(()=>{ remaining--; timeLeftEl.textContent=remaining; if(remaining<=0){ stopSession(true);} },1000); }
  function stopSession(auto=false){ if(timer){ clearInterval(timer); timer=null; } sessionStartBtn.disabled=false; sessionStopBtn.disabled=true; sessionMarkBtn.disabled=true; if(reps>0 || !auto){ const entry={ date:new Date().toISOString().slice(0,10), module:sessionModuleSel.value, duration:Math.max(0, parseInt(sessionDurationInput.value)||90), reps:reps, notes:notesEl.value.trim() }; state.progress.push(entry); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderProgress(); } }
  function markRep(){ reps++; repCountEl.textContent=reps; clickSound(); }
  sessionStartBtn.addEventListener('click', startSession);
  sessionStopBtn.addEventListener('click', ()=>stopSession(false));
  sessionMarkBtn.addEventListener('click', markRep);
  document.getElementById('startQuickSession').addEventListener('click', ()=>{ sessionModuleSel.value = quickModuleSel.value; document.querySelector('[data-tab="session"]').click(); startSession(); });

  function init(){ populateModuleSelects(); renderModules(); renderProgress(); }
  init();
})();
