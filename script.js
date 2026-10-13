/* =====================================================================
   sahara. | working prototype (minimal light theme)
   Consent-driven telemetry + empathetic AI companion + escalation engine
===================================================================== */
const $ = id => document.getElementById(id);

/* ---------------- storage ---------------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('sahara_'+k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('sahara_'+k, JSON.stringify(v)); return true; }catch(e){ return false; } }
};

let profile  = store.get('profile', null);            // {name, lang, consent, fr, frP, thP, tone, photo, since}
let vitals   = store.get('vitals', null);             // 14 days of simulated telemetry
let checkins = store.get('checkins', []);             // {date, mood, stress, note}
let chats    = store.get('chats', []);                // {role:'user'|'ai'|'sys', text}
let aiCfg    = store.get('aicfg', {base:'', key:'', model:''});
let ttsOn    = store.get('tts', true);

const LANG_NAMES   = {en:'English', hi:'हिन्दी', ta:'தமிழ்', bn:'বাংলা', mr:'मराठी'};
const SPEECH_CODES = {en:'en-IN', hi:'hi-IN', ta:'ta-IN', bn:'bn-IN', mr:'mr-IN'};

/* local calendar date as YYYY-MM-DD (avoids the UTC off-by-one before 5:30am in India) */
const ymd = d => { const z = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; };
const todayStr = () => ymd(new Date());
const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const EASE = 'cubic-bezier(.22,1,.36,1)';
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------- rolling numbers (slot-reel feel) ---------------- */
function setNum(id, val){
  const el = $(id), next = String(val);
  const first = el.dataset.v === undefined;
  const prev = first ? el.textContent.trim() : el.dataset.v;
  if(!first && prev === next) return;
  el.dataset.v = next;
  if(reduce.matches || prev === next || !el.animate){ el.textContent = next; return; }

  const up = !(parseFloat(next) < parseFloat(prev));          // bigger (or non-numeric) rolls upward
  const reel = document.createElement('span'); reel.className = 'reel';
  const a = document.createElement('span'), b = document.createElement('span');
  a.textContent = up ? prev : next;
  b.textContent = up ? next : prev;
  reel.append(a, b);
  el.textContent = ''; el.appendChild(reel);
  const frames = up ? [{transform:'translateY(0)'},{transform:'translateY(-50%)'}]
                    : [{transform:'translateY(-50%)'},{transform:'translateY(0)'}];
  const anim = reel.animate(frames, {duration: 1000, easing: EASE, fill:'both'});
  anim.onfinish = () => { if(el.dataset.v === next) el.textContent = next; };
}

/* ---------------- telemetry simulation (The Pulse) ---------------- */
function seedVitals(){
  const days = [];
  const now = Date.now();
  for(let i=13; i>=0; i--){
    const d = new Date(now - i*86400000);
    const wave = Math.sin(i/2.4)*8;
    const stress = Math.max(8, Math.min(78, Math.round(34 + wave + (Math.random()*16-8))));
    days.push({
      date: ymd(d),
      hr: Math.round(70 + stress*0.22 + (Math.random()*6-3)),                      // higher stress, higher HR
      sleep: Math.round((7.6 - stress*0.03 + (Math.random()*.8-.4))*10)/10,        // higher stress, less sleep
      stress
    });
  }
  store.set('vitals', days);
  return days;
}
function ensureData(){
  if(!vitals) vitals = seedVitals();
  const today = todayStr();
  if(!vitals.some(v => v.date === today)){
    const last = vitals[vitals.length-1];
    vitals.push({ date: today, hr: Math.round(last.hr + (Math.random()*6-3)), sleep: last.sleep, stress: Math.round(last.stress + (Math.random()*8-4)) });
    if(vitals.length > 14) vitals.shift();
    store.set('vitals', vitals);
  }
}
function baseline(field){ // 7-day baseline before today
  const past = vitals.slice(-8,-1);
  return Math.round(past.reduce((s,v) => s+v[field], 0) / Math.max(1, past.length) * 10) / 10;
}
function currentStress(){
  const last = checkins[checkins.length-1];
  const t = vitals[vitals.length-1];
  if(last && last.date === todayStr()) return Math.round(last.stress*0.6 + t.stress*0.4);
  return t.stress;
}
function calcStreak(){
  const dates = new Set(checkins.map(c => c.date));
  let n = 0;
  for(let i=0;;i++){
    const d = ymd(new Date(Date.now() - i*86400000));
    if(dates.has(d)) n++; else break;
  }
  return n;
}

/* ---------------- onboarding (steps slide like slots) ---------------- */
let obStep = 0;
function showStep(n, focus){
  obStep = n;
  $('obTrack').style.transform = `translateX(${-n*100}%)`;
  $('obBar').style.width = ((n+1)/4*100) + '%';
  document.querySelectorAll('#obTrack .step').forEach((el,i) => { el.inert = i !== n; });
  if(focus){
    setTimeout(() => {
      const f = document.querySelector(`#s${n} input, #s${n} select`);
      if(f) f.focus({preventScroll:true});
    }, 380);
  }
}
function obNext(){
  if(obStep === 0 && !$('obName').value.trim()){ toast('Please tell me a name to call you 💜'); return; }
  if(obStep === 2 && !$('obFrPhone').value.trim()){ toast('A phone number keeps the safety net real.'); return; }
  showStep(obStep+1, true);
}
function obPrev(){ showStep(obStep-1, true); }
$('obViewport').addEventListener('keydown', e => {
  if(e.key !== 'Enter' || e.target.tagName === 'SELECT' || e.target.type === 'checkbox' || e.target.tagName === 'BUTTON') return;
  const next = e.target.closest('.step')?.querySelector('.btn:not(.btn-quiet)');
  if(next){ e.preventDefault(); next.click(); }
});

const DEFAULT_TONE = '#EDE4D3';
function finishOnboard(){
  profile = {
    name: $('obName').value.trim() || 'Friend',
    lang: $('obLang').value,
    consent: $('obConsent').checked,
    fr: $('obFrName').value.trim() || 'Trusted friend',
    frP: $('obFrPhone').value.trim(),
    thP: $('obThPhone').value.trim(),
    tone: DEFAULT_TONE,
    since: todayStr()
  };
  aiCfg = { base: $('obApiBase').value.trim(), key: $('obApiKey').value.trim(), model: $('obModel').value.trim() || 'gpt-4o-mini' };
  store.set('profile', profile); store.set('aicfg', aiCfg);
  enterApp(true);
  loadSettings();
}
function enterApp(animate){
  ensureData();
  if(!profile.since){ profile.since = todayStr(); store.set('profile', profile); }
  $('app').classList.add('show');
  if(animate){
    $('onboard').classList.add('leaving');
    setTimeout(() => $('onboard').classList.add('hidden'), 750);
  }else{
    $('onboard').classList.add('hidden');
  }
  $('langNote').textContent = LANG_NAMES[profile.lang] || 'English';
  if(!chats.length){
    chats.push({role:'ai', text:`Hello ${profile.name} 🪷\n\nI'm Sahara, your companion for this journey. There's no schedule here, no judgement, and nothing you say is too much or too little.\n\nHow has today been sitting in your chest?`});
    store.set('chats', chats);
  }
  applyProfile();
  renderAll();
  movePill(true);
}

/* ---------------- navigation (views slide like slots) ---------------- */
const ORDER = ['dash','chat','checkin','report','settings','profile'];
let curView = 'dash', endTransition = null;

function movePill(instant){
  const pill = $('navPill'), act = document.querySelector('#tabs button.active');
  if(!act){ pill.style.opacity = 0; return; }
  if(!act.offsetWidth) return;                          // app not visible yet
  if(instant) pill.classList.add('no-anim');
  pill.style.opacity = 1;
  pill.style.width  = act.offsetWidth + 'px';
  pill.style.height = act.offsetHeight + 'px';
  pill.style.transform = `translate(${act.offsetLeft}px, ${act.offsetTop}px)`;
  if(instant){ void pill.offsetWidth; pill.classList.remove('no-anim'); }
}
function setNavActive(view){
  document.querySelectorAll('#tabs button').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    if(on) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $('meBtn').classList.toggle('active', view === 'profile');
  movePill();
}
function afterShow(view){
  Object.values(charts).forEach(c => c.resize());        // charts drawn while hidden need a nudge
  if(view === 'chat') $('msgs').scrollTop = 1e9;
}
function go(view){
  if(!ORDER.includes(view)) return;
  if(view === 'profile' && (!draft || !profileDirty())) loadProfileForm();
  if(endTransition) endTransition();                     // settle any slide still in flight
  setNavActive(view);
  if(view === curView) return;

  const from = $('view-'+curView), to = $('view-'+view);
  const dir = ORDER.indexOf(view) > ORDER.indexOf(curView) ? 1 : -1;
  curView = view;
  window.scrollTo(0,0);

  if(reduce.matches || !from.animate){
    from.classList.remove('active'); to.classList.add('active'); afterShow(view); return;
  }
  from.classList.add('leaving');
  to.classList.add('active');
  const out = from.animate(
    [{opacity:1, transform:'translateX(0)'}, {opacity:0, transform:`translateX(${-dir*56}px)`}],
    {duration: 420, easing: EASE, fill:'forwards'});
  const inn = to.animate(
    [{opacity:0, transform:`translateX(${dir*80}px)`}, {opacity:1, transform:'translateX(0)'}],
    {duration: 700, easing: EASE, fill:'backwards'});
  let done = false;
  endTransition = () => {
    if(done) return; done = true;
    out.cancel(); inn.cancel();
    from.classList.remove('active','leaving');
    endTransition = null;
  };
  inn.onfinish = endTransition;
  afterShow(view);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => go(b.dataset.view));
$('meBtn').onclick = () => go('profile');
$('meBtnM').onclick = () => go('profile');
document.querySelectorAll('.js-sos').forEach(b => b.onclick = () => openModal());
let pillRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(pillRaf); pillRaf = requestAnimationFrame(() => movePill(true)); });
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(true));

/* ---------------- stress gauge ---------------- */
let gaugeBooted = false;
function paintGauge(s){
  const m = $('gaugeMarker'), pct = Math.max(0, Math.min(100, s));
  if(!gaugeBooted){
    gaugeBooted = true;                                  // the one orchestrated moment: the marker slides in on first load
    m.style.transition = 'none'; m.style.left = '0%';
    void m.offsetWidth;
    m.style.transition = '';
  }
  m.style.left = pct + '%';
  m.dataset.tier = tierOf(s);
  $('gauge').setAttribute('aria-valuenow', s);
}

/* ---------------- charts (Chart.js) ---------------- */
const charts = {};
const INK2 = '#646B73';
const thresholdPlugin = {
  id: 'thresholds',
  afterDraw(chart, args, opts){
    if(!opts || !opts.show) return;
    const { ctx, chartArea:{ left, right }, scales:{ y } } = chart;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px "Hanken Grotesk", sans-serif';
    ctx.textAlign = 'right';
    [[45,'elevated'],[65,'high']].forEach(([v,label]) => {
      const py = y.getPixelForValue(v);
      ctx.setLineDash([4,4]); ctx.strokeStyle = 'rgba(30,35,40,.26)';
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(right, py); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = INK2;
      ctx.fillText(label, right-4, py-5);
    });
    ctx.restore();
  }
};
if(typeof Chart !== 'undefined') Chart.register(thresholdPlugin);

function dayLabel(dateStr, withDate){
  const dt = new Date(dateStr + 'T00:00:00');
  return withDate ? dt.toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : dt.toLocaleDateString('en-IN', {weekday:'short'});
}

function lineChart(id, labels, data, o){
  if(typeof Chart === 'undefined') return;      // CDN blocked: the rest of the app still works
  const cv = $(id); if(!cv) return;
  if(charts[id]){
    const c = charts[id];
    c.data.labels = labels; c.data.datasets[0].data = data; c.update();
    return;
  }
  charts[id] = new Chart(cv, {
    type: 'line',
    data: { labels, datasets: [{
      data,
      borderColor: o.color, borderWidth: 2.25, tension: .38,
      pointRadius: 3.5, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: o.color, pointBorderWidth: 2,
      fill: true,
      backgroundColor: c => {
        const a = c.chart.chartArea;
        if(!a) return o.color + '14';
        const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, o.color + '2E'); g.addColorStop(1, o.color + '00');
        return g;
      }
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 1100, easing: 'easeOutQuart' },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        thresholds: { show: !!o.thresholds },
        tooltip: {
          backgroundColor: '#1E2328', padding: 10, cornerRadius: 10, displayColors: false,
          titleFont: { family: 'Hanken Grotesk', weight: '600' }, bodyFont: { family: 'Hanken Grotesk' },
          callbacks: { label: ctx => `${o.label} ${ctx.parsed.y}${o.unit || ''}` }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: INK2, font: { family: 'Hanken Grotesk', size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
        y: { min: o.min, max: o.max, grid: { color: '#EEEEEA' }, border: { display: false }, ticks: { color: INK2, font: { family: 'Hanken Grotesk', size: 11 }, stepSize: o.step } }
      }
    }
  });
}

/* ---------------- dashboard ---------------- */
function renderDash(){
  const h = new Date().getHours();
  $('daypart').textContent = h<12 ? 'morning' : h<17 ? 'afternoon' : h<21 ? 'evening' : 'night';

  const s = currentStress();
  setNum('stStress', s);
  const pill = s>=65 ? ['bad','High distress: engine alert'] : s>=45 ? ['warn','Elevated: gentle nudge ready'] : ['good','Calm: all good'];
  $('stStressPill').innerHTML = `<span class="pill ${pill[0]}">${pill[1]}</span>`;
  paintGauge(s);

  const t = vitals[vitals.length-1], bHr = baseline('hr');
  setNum('stHr', t.hr);
  const dHr = Math.round(t.hr - bHr);
  $('stHrD').textContent = `${dHr>=0 ? '+' : ''}${dHr} bpm vs 7-day baseline of ${bHr}`;
  setNum('stSleep', t.sleep);
  setNum('stStreak', calcStreak());

  $('suggestionTxt').textContent =
      s>=65 ? 'Your signals have been heavy for a couple of days. You don\'t have to wait until it breaks. Reaching out now is strength, not weakness.'
    : s>=45 ? 'There\'s a slight edge in your body today. A slow walk or the 5-4-3-2-1 grounding might soften it.'
    :         'Your body is resting easier today. Savor it, and maybe write one line about what felt safe today.';

  const week = vitals.slice(-7);
  lineChart('chartStress', week.map(v => dayLabel(v.date)), week.map(v => v.stress),
    { color:'#2D7A73', min:0, max:100, step:25, label:'Stress', thresholds:true });
  lineChart('chartHr', week.map(v => dayLabel(v.date)), week.map(v => v.hr),
    { color:'#6B7785', min:50, max:110, step:20, label:'Heart rate', unit:' bpm' });
}

/* ---------------- check-in ---------------- */
let selMood = 0;
document.querySelectorAll('#moodRow button').forEach(b => b.onclick = () => {
  selMood = +b.dataset.m;
  document.querySelectorAll('#moodRow button').forEach(x => x.classList.toggle('sel', x === b));
});
$('stressRange').oninput = e => { $('stressVal').textContent = e.target.value; };
$('saveCheckin').onclick = () => {
  if(!selMood){ toast('Pick the closest face. Honesty over optimism 💜'); return; }
  const today = todayStr();
  const rec = { date: today, mood: selMood, stress: +$('stressRange').value, note: $('noteInput').value.trim() };
  checkins = checkins.filter(c => c.date !== today); checkins.push(rec);
  store.set('checkins', checkins);
  vitals[vitals.length-1].stress = rec.stress; store.set('vitals', vitals);
  toast('Saved. Thank you for showing up today ✨');
  renderAll();
  addMsg('ai', `Thank you for checking in, ${profile.name}. I'll hold onto that. ${rec.stress>=60 ? 'And if today is heavy, I\'m right here. Say the word and we\'ll slow it down together.' : 'May tomorrow be a little gentler. 💜'}`);
};
function renderCheckin(){
  const tl = $('checkinTimeline');
  const list = [...checkins].reverse().slice(0,10);
  const faces = {1:'😢',2:'😕',3:'😐',4:'🙂',5:'😊'};
  tl.innerHTML = list.length ? list.map(c => `
      <div class="ev">
        <div class="small"><b>${c.date}</b> &nbsp;${faces[c.mood] || ''} &nbsp;<span class="muted">stress ${c.stress}</span></div>
        ${c.note ? `<div class="small muted" style="margin-top:2px;">“${esc(c.note)}”</div>` : ''}
      </div>`).join('')
    : '<p class="small muted">No check-ins yet. Pick a face on the left and save your first one today.</p>';
}

/* ---------------- report ---------------- */
function tierOf(s){ return s>=65 ? 3 : s>=45 ? 2 : 1; }
function renderReport(){
  const s = currentStress();
  lineChart('chartStressLong', vitals.map(v => dayLabel(v.date, true)), vitals.map(v => v.stress),
    { color:'#2D7A73', min:0, max:100, step:25, label:'Stress', thresholds:true });

  const tier = tierOf(s);
  $('tierBox').innerHTML = `
    <div style="margin-bottom:10px;"><span class="pill ${tier>=3 ? 'bad' : tier===2 ? 'warn' : 'good'}">Tier ${tier}: ${tier>=3 ? 'Action Hub armed' : tier===2 ? 'Gentle nudges active' : 'Casual check-ins'}</span></div>
    ${tier>=2 ? '<div class="muted" style="line-height:1.7">Your stress index and heart-rate trend sit above your personal baseline. Sahara is watching for a downward spiral and will pivot conversations to grounding.</div>'
              : '<div class="muted" style="line-height:1.7">You are inside your normal band. Sahara stays light with friendly conversation and no clinical pushing.</div>'}`;

  const week = vitals.slice(-7), prev = vitals.slice(0,7);
  const avg = a => Math.round(a.reduce((x,v) => x+v.stress, 0) / a.length);
  const trend = avg(week) - avg(prev);
  const nLow = week.filter(v => v.stress < 30).length, nHigh = week.filter(v => v.stress >= 60).length;
  const worst = week.reduce((a,b) => b.stress > a.stress ? b : a, week[0]);
  const moodTxt = checkins.length ? (checkins.slice(-7).reduce((a,c) => a+c.mood, 0) / Math.min(7, checkins.length)).toFixed(1) : 'n/a';
  $('reportBox').textContent =
`SAHARA JOURNEY REPORT, generated ${new Date().toLocaleDateString()}
Patient alias: ${profile.name} · Language: ${LANG_NAMES[profile.lang]}

PHYSIOLOGICAL TELEMETRY (consent-driven)
• Mean stress index, last 7 days: ${avg(week)} / 100 (previous 7: ${avg(prev)}, change ${trend>=0 ? '+'+trend : trend})
• Peak distress day: ${worst.date} (index ${worst.stress})
• Resting HR today: ${vitals[vitals.length-1].hr} bpm · Sleep: ${vitals[vitals.length-1].sleep} h
• Days with low distress (<30): ${nLow}/7 · high (≥60): ${nHigh}/7

SELF-REPORT
• Mean self-reported mood (last 7 check-ins, 1–5): ${moodTxt}
• Check-ins completed: ${checkins.length}

ESCALATION ENGINE
• Current tier: ${tier>=3 ? 'BASE: Action Hub armed, structured choices offered' : tier===2 ? 'MIDDLE: pattern deviation detected, gentle nudges active' : 'TOP: casual empathetic check-ins'}
${tier>=2 ? '• Recommendation: professional consult advised.' : '• Recommendation: continue self-guided support.'}

GENERATED BY SAHARA PROTOTYPE. NOT A DIAGNOSIS.`;
}
$('genReport').onclick = () => { renderReport(); toast('Report refreshed ✨'); };
function downloadReport(){
  const blob = new Blob([$('reportBox').textContent], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'sahara-report.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------- THE EMPATHY & ESCALATION ENGINE ---------------- */
const CRISIS_WORDS = /(kill myself|suicide|end it all|end my life|want to die|no reason to live|self harm|cut myself|आत्महत्य|मरना चाहता|मरना चाहती|marne)/i;
const LOW_WORDS    = /(sad|depress|hopeless|alone|lonely|cry|crying|panic|anxious|anxiety|nightmare|trigger|flashback|afraid|scared|can't sleep|hate myself|worthless|breakdown|शर्मिंदा|डर|अकेल|रो|परेशान|घबरा)/i;
const GOOD_WORDS   = /(better|good|happy|calm|peaceful|fine|okay|grateful|hope|अच्छा|शांत|खुश|ठीक)/i;

function userDistress(text){
  if(CRISIS_WORDS.test(text)) return 3;   // crisis
  if(LOW_WORDS.test(text))    return 2;   // low
  if(GOOD_WORDS.test(text))   return 1;   // good
  return 0;                               // neutral
}

function systemPrompt(){
  const s = currentStress(), t = vitals[vitals.length-1];
  const langLine = profile.lang === 'en' ? 'English' : `the user's language (${LANG_NAMES[profile.lang]})`;
  return `You are Sahara, a warm, empathetic AI companion for a trauma survivor named ${profile.name}. You are NOT a doctor and never diagnose.
Rules:
- Speak only in ${langLine}. Keep replies short (2-4 sentences), gentle, non-clinical, like a caring friend.
- Never force assessments or ask questionnaires. Use casual conversation to gauge feelings (Top Tier).
- If the user sounds low, acknowledge first, then gently offer ONE grounding option (Middle Tier).
- NEVER repeat their trauma back to them or push for details. Follow their pace.
- If there is any hint of self-harm or crisis: respond with care, stay with them, and tell them you can open the Safety Hub with people to call. You are not an emergency service.
Context (private, consent-driven): today's stress index ${s}/100, resting HR ${t.hr} bpm, sleep ${t.sleep}h. Weave this in at most subtly, if useful.`;
}

function offlineReply(text, level){
  const name = profile.name;
  if(level === 3) return null; // handled by crisis path
  if(level === 2){
    const opts = [
      `I hear you, ${name}. That weight sounds real, and it makes sense that it feels heavy today. You don't have to explain more than you want to.\n\nWould it help to try one slow breathing round with me? I can guide you. Just say "breathing".`,
      `Thank you for telling me, ${name}. What you're carrying isn't small, and you're not weak for feeling it.\n\nWhen it gets like this, some people find the 5-4-3-2-1 grounding helps. Want me to walk you through it? Just say "grounding".`,
      `I'm staying right here with you, ${name}. Your body has been working hard too. I can see it in your signals.\n\nNo pressure to talk more. A box-breathing break might give your nervous system a small rest. Say "breathing" if you'd like that.`
    ];
    return opts[Math.floor(Math.random()*opts.length)];
  }
  if(level === 1){
    const opts = [
      `That's lovely to hear, ${name}. I'm going to remember this good moment for the harder days. What made it feel good, even in one word?`,
      `It matters that you noticed feeling lighter, ${name}. Good days are data too, proof your system still knows peace. 💜`,
      `So glad, ${name}. Rest into it. Nothing to fix today.`
    ];
    return opts[Math.floor(Math.random()*opts.length)];
  }
  const opts = [
    `I'm listening, ${name}. Tell me more about that, or not at all, whatever feels right.`,
    `Mm, I'm here. How is that sitting in your body right now?`,
    `Thank you for sharing. There's no rush here. We have all the time you need.`
  ];
  return opts[Math.floor(Math.random()*opts.length)];
}

async function aiReply(text, level){
  const hasApi = aiCfg.base && aiCfg.key;
  if(!hasApi) return { text: offlineReply(text, level), src:'offline' };
  try{
    const url = aiCfg.base.replace(/\/+$/,'') + '/chat/completions';
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+aiCfg.key },
      body: JSON.stringify({
        model: aiCfg.model || 'gpt-4o-mini',
        messages: [
          {role:'system', content: systemPrompt()},
          ...chats.slice(-10).filter(c => c.role !== 'sys').map(c => ({role: c.role === 'ai' ? 'assistant' : 'user', content: c.text})),
          {role:'user', content: text}
        ],
        temperature: 0.8, max_tokens: 250
      })
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const j = await res.json();
    const t = j.choices?.[0]?.message?.content?.trim();
    if(!t) throw new Error('empty');
    return { text: t, src:'api' };
  }catch(e){
    toast('AI API unreachable. Using the offline engine.');
    return { text: offlineReply(text, level), src:'offline' };
  }
}

function handleUserMessage(text){
  const level = userDistress(text);
  addMsg('user', text);

  if(level === 3){ // crisis: straight to the Action Hub
    addMsg('sys', '⚠ Sahara noticed you may be in danger. Opening the Safety Hub. You deserve help right now.');
    openModal(true);
    addMsg('ai', 'I\'m staying right here with you. You are not alone in this moment, and reaching out was brave. Tell me when you\'re ready to keep talking, or just breathe with me. 💜');
    return;
  }

  // the replies promise these keywords, so honour them
  if(/breath|साँस|सांस/i.test(text)){ doGrounding('box'); return; }
  if(/ground/i.test(text)){ doGrounding('54321'); return; }

  const typing = showTyping();
  aiReply(text, level).then(r => {
    typing.remove();
    addMsg('ai', r.text);
    if(level === 2){ // gentle nudge pivot
      setTimeout(() => addMsg('sys', '💡 Gentle nudge: Sahara can guide a grounding exercise. Tap "Instant relief" on the right, or type "breathing".'), 900);
    }
  });
}

function showTyping(){
  const d = document.createElement('div');
  d.className = 'msg ai typing fresh'; d.innerHTML = '<i></i><i></i><i></i>';
  $('msgs').appendChild(d); $('msgs').scrollTop = 1e9;
  return d;
}
function msgEl(role, text, fresh){
  const d = document.createElement('div');
  d.className = 'msg ' + (role === 'ai' ? 'ai' : role === 'user' ? 'user' : 'sys') + (fresh ? ' fresh' : '');
  d.textContent = text;
  return d;
}
function addMsg(role, text){
  chats.push({role, text}); store.set('chats', chats);
  $('msgs').appendChild(msgEl(role, text, true));
  $('msgs').scrollTo({ top: $('msgs').scrollHeight, behavior: reduce.matches ? 'auto' : 'smooth' });
  if(role === 'ai' && ttsOn) speak(text);
}
function renderChats(){
  $('msgs').innerHTML = '';
  chats.forEach(c => $('msgs').appendChild(msgEl(c.role, c.text, false)));
  $('msgs').scrollTop = 1e9;
}

/* voice input */
let recog = null, listening = false;
$('micBtn').onclick = () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ toast('Voice input is not supported in this browser'); return; }
  if(listening){ recog && recog.stop(); return; }
  recog = new SR();
  recog.lang = SPEECH_CODES[profile.lang] || 'en-IN';
  recog.interimResults = false;
  recog.onstart  = () => { listening = true; $('micBtn').classList.add('rec'); toast('Listening… speak freely'); };
  recog.onend    = () => { listening = false; $('micBtn').classList.remove('rec'); };
  recog.onresult = e => { $('chatInput').value = e.results[0][0].transcript; sendChat(); };
  recog.onerror  = () => { toast('Could not hear you. Try typing instead.'); };
  recog.start();
};
$('sendBtn').onclick = sendChat;
$('chatInput').addEventListener('keydown', e => { if(e.key === 'Enter') sendChat(); });
function sendChat(){
  const t = $('chatInput').value.trim(); if(!t) return;
  $('chatInput').value = '';
  handleUserMessage(t);
}
function speak(text){
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\p{Extended_Pictographic}/gu, ''));
    u.lang = SPEECH_CODES[profile.lang] || 'en-IN'; u.rate = .95; u.pitch = 1;
    speechSynthesis.speak(u);
  }catch(e){}
}
$('ttsToggle').onchange = e => {
  ttsOn = e.target.checked; store.set('tts', ttsOn); $('setTts').checked = ttsOn;
  if(!ttsOn) speechSynthesis.cancel();
};

/* grounding */
const GROUND = {
  box:     ['Box breathing', 'Breathe in 4… hold 4… out 4… hold 4. Repeat four rounds. I\'m counting with you.'],
  '54321': ['5-4-3-2-1 grounding', 'Name 5 things you can see… 4 you can touch… 3 you can hear… 2 you can smell… 1 you can taste. You are here, and you are safe.'],
  body:    ['Body scan', 'Start at your toes and climb slowly: notice, don\'t judge. Unclench your jaw. Drop your shoulders. Let your hands rest.']
};
function doGrounding(kind){
  addMsg('ai', `🧘 ${GROUND[kind][0]}\n\n${GROUND[kind][1]}`);
  closeModal();
  go('chat');
}

/* ---------------- overlays (safety hub, photo crop) ---------------- */
let focusStack = [];
function openOverlay(id, focusEl){
  const o = $(id);
  if(o.classList.contains('show')) return;
  focusStack.push(document.activeElement);
  o.classList.add('show');
  $('app').inert = true;                                  // simple focus trap: only the overlay is reachable
  if(focusEl) focusEl.focus({preventScroll:true});
}
function closeOverlay(id){
  const o = $(id);
  if(!o.classList.contains('show')) return;
  o.classList.remove('show');
  if(!document.querySelector('.overlay.show')) $('app').inert = false;
  const f = focusStack.pop();
  if(f && f.focus && document.contains(f)) f.focus({preventScroll:true});
}
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if($('cropBg').classList.contains('show')) closeCrop();
  else if($('modalBg').classList.contains('show')) closeModal();
});

/* ---------------- action hub ---------------- */
function openModal(crisis){
  $('modalMsg').textContent = crisis === true
    ? 'You\'ve told me something that tells me you\'re hurting badly right now. Please pick one, even the smallest one. I\'ll wait with you.'
    : 'You don\'t have to carry this alone. Choose what feels safest right now. Nothing happens unless you tap it.';
  $('actFriend').textContent = 'Call ' + (profile?.fr || 'a trusted person') + (profile?.frP ? ' · ' + profile.frP : '');
  $('actTherapist').textContent = 'Call my therapist or clinic' + (profile?.thP ? ' · ' + profile.thP : ' (not set in Settings)');
  $('breatheWrap').style.display = 'none';
  openOverlay('modalBg', $('actFriend'));
}
function closeModal(){ closeOverlay('modalBg'); }
$('modalBg').onclick = e => { if(e.target === e.currentTarget) closeModal(); };
$('actFriend').onclick    = () => { const p = profile?.frP; p ? location.href = 'tel:'+p : toast('Add a trusted contact in Settings first'); };
$('actTherapist').onclick = () => { const p = profile?.thP; p ? location.href = 'tel:'+p : toast('No therapist number set. Try Settings.'); };
$('actEmergency').onclick = () => { location.href = 'tel:112'; };
$('actBreathe').onclick   = () => {
  addMsg('ai', `🧘 ${GROUND.box[0]}\n\n${GROUND.box[1]}`);
  $('breatheWrap').style.display = 'block';
};

/* ---------------- profile (name, colour, photo) ---------------- */
const TONES = [
  {n:'Sand',  c:'#EDE4D3'}, {n:'Sage',  c:'#DCEBE5'}, {n:'Sky',   c:'#DCE6F0'},
  {n:'Lilac', c:'#E6E1F0'}, {n:'Rose',  c:'#F1DDE3'}, {n:'Stone', c:'#E4E4E0'}
];
let draft = null;                                         // unsaved edits: {name, tone, photo}

function paintAvatar(el, p){
  const photo = p.photo || '';
  el.style.backgroundImage = photo ? `url("${photo}")` : '';
  el.style.backgroundColor = photo ? '' : (p.tone || DEFAULT_TONE);
  el.textContent = photo ? '' : ((p.name || '').trim()[0] || 'S').toUpperCase();
}
function applyProfile(){
  $('dashName').textContent = profile.name;
  $('railName').textContent = profile.name;
  paintAvatar($('avatar'), profile);
  paintAvatar($('avatarM'), profile);
}
function profileDirty(){
  if(!draft) return false;
  return draft.name.trim() !== profile.name || draft.tone !== (profile.tone || DEFAULT_TONE) || (draft.photo || '') !== (profile.photo || '');
}
function loadProfileForm(){
  draft = { name: profile.name, tone: profile.tone || DEFAULT_TONE, photo: profile.photo || '' };
  $('pfName').value = draft.name;
  refreshProfileUI();
}
function refreshProfileUI(){
  if(!draft) return;
  paintAvatar($('pfAvatar'), draft);
  const nm = draft.name.trim();
  $('pfNameLive').textContent = nm || 'Your name';
  $('pfRemove').disabled = !draft.photo;
  document.querySelectorAll('#pfSwatches .swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === draft.tone)));
  $('pfErr').hidden = !!nm;
  $('pfSave').disabled = !nm || !profileDirty();
  $('pfDiscard').disabled = !profileDirty();
}
function renderProfileStats(){
  $('pfCheckins').textContent = checkins.length;
  $('pfStreak').textContent = calcStreak();
  const since = new Date((profile.since || todayStr()) + 'T00:00:00');
  $('pfSince').textContent = 'On Sahara since ' + since.toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'});
}
(function buildSwatches(){
  $('pfSwatches').innerHTML = TONES.map(t =>
    `<button type="button" class="swatch" data-c="${t.c}" style="background:${t.c}" aria-label="${t.n}" aria-pressed="false"></button>`).join('');
  $('pfSwatches').addEventListener('click', e => {
    const b = e.target.closest('.swatch'); if(!b || !draft) return;
    draft.tone = b.dataset.c; refreshProfileUI();
  });
})();
$('pfName').addEventListener('input', e => { draft.name = e.target.value; refreshProfileUI(); });
$('pfDiscard').onclick = () => { loadProfileForm(); toast('Changes discarded'); };
$('pfRemove').onclick  = () => { draft.photo = ''; refreshProfileUI(); };
$('pfSave').onclick = () => {
  const prev = { name: profile.name, tone: profile.tone, photo: profile.photo };
  profile.name = draft.name.trim().slice(0,40);
  profile.tone = draft.tone;
  if(draft.photo) profile.photo = draft.photo; else delete profile.photo;
  if(!store.set('profile', profile)){                     // storage full: keep the old profile
    profile.name = prev.name; profile.tone = prev.tone;
    if(prev.photo) profile.photo = prev.photo; else delete profile.photo;
    toast('Could not save. Try a smaller photo or free up browser storage.');
    return;
  }
  applyProfile(); renderProfileStats(); loadProfileForm();
  toast('Profile saved ✨');
};
$('pfCam').onclick = $('pfChange').onclick = () => $('pfFile').click();
$('pfFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; openCrop(f); };

/* --- photo cropper: drag to move, slider or wheel to zoom --- */
const CROP = 280;                                         // logical stage size; canvas is drawn at 2x
let cropImg = null, cropUrl = null, cropS0 = 1, cropZ = 1, cropX = 0, cropY = 0, cropDrag = null;

function openCrop(file){
  if(!file) return;
  if(!/^image\//.test(file.type)){ toast('Choose an image file, like a JPG or PNG.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    cropImg = img; cropUrl = url;
    cropS0 = Math.max(CROP / img.naturalWidth, CROP / img.naturalHeight);   // image always covers the frame
    cropZ = 1; $('cropZoom').value = 100;
    cropX = (CROP - img.naturalWidth * cropS0) / 2;
    cropY = (CROP - img.naturalHeight * cropS0) / 2;
    drawCrop();
    openOverlay('cropBg', $('cropStage'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened. Try a JPG or PNG.'); };
  img.src = url;
}
function closeCrop(){
  closeOverlay('cropBg');
  if(cropUrl){ URL.revokeObjectURL(cropUrl); cropUrl = null; }
  cropImg = null;
}
function clampCrop(){
  const s = cropS0 * cropZ, w = cropImg.naturalWidth * s, h = cropImg.naturalHeight * s;
  cropX = Math.min(0, Math.max(CROP - w, cropX));
  cropY = Math.min(0, Math.max(CROP - h, cropY));
}
function drawCrop(){
  if(!cropImg) return;
  clampCrop();
  const c = $('cropCanvas'), ctx = c.getContext('2d'), k = c.width / CROP, s = cropS0 * cropZ;
  ctx.setTransform(k,0,0,k,0,0);
  ctx.fillStyle = '#F4F4F1'; ctx.fillRect(0,0,CROP,CROP);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropImg, cropX, cropY, cropImg.naturalWidth * s, cropImg.naturalHeight * s);
}
function setZoom(z){
  if(!cropImg) return;
  z = Math.min(3, Math.max(1, z));
  const sOld = cropS0 * cropZ, sNew = cropS0 * z;
  const cx = (CROP/2 - cropX) / sOld, cy = (CROP/2 - cropY) / sOld;     // keep the centre point fixed
  cropZ = z; cropX = CROP/2 - cx * sNew; cropY = CROP/2 - cy * sNew;
  $('cropZoom').value = Math.round(z * 100);
  drawCrop();
}
(function bindCropper(){
  const st = $('cropStage');
  const k = () => CROP / st.clientWidth;                  // CSS px to logical units (stage can shrink on small phones)
  st.addEventListener('pointerdown', e => {
    if(!cropImg) return;
    cropDrag = { x:e.clientX, y:e.clientY, ox:cropX, oy:cropY };
    st.setPointerCapture(e.pointerId); st.classList.add('grabbing');
  });
  st.addEventListener('pointermove', e => {
    if(!cropDrag || !cropImg) return;
    cropX = cropDrag.ox + (e.clientX - cropDrag.x) * k();
    cropY = cropDrag.oy + (e.clientY - cropDrag.y) * k();
    drawCrop();
  });
  ['pointerup','pointercancel'].forEach(t => st.addEventListener(t, () => { cropDrag = null; st.classList.remove('grabbing'); }));
  st.addEventListener('wheel', e => { e.preventDefault(); setZoom(cropZ * (e.deltaY < 0 ? 1.06 : 1/1.06)); }, {passive:false});
  st.addEventListener('keydown', e => {
    const step = 12;
    if(e.key === 'ArrowLeft')       cropX += step;
    else if(e.key === 'ArrowRight') cropX -= step;
    else if(e.key === 'ArrowUp')    cropY += step;
    else if(e.key === 'ArrowDown')  cropY -= step;
    else if(e.key === '+' || e.key === '=') { setZoom(cropZ * 1.1); e.preventDefault(); return; }
    else if(e.key === '-')                  { setZoom(cropZ / 1.1); e.preventDefault(); return; }
    else return;
    e.preventDefault(); drawCrop();
  });
  $('cropZoom').addEventListener('input', e => setZoom(e.target.value / 100));
  $('cropCancel').onclick = closeCrop;
  $('cropBg').onclick = e => { if(e.target === e.currentTarget) closeCrop(); };
  $('cropOk').onclick = () => {
    if(!cropImg) return;
    const out = document.createElement('canvas'); out.width = out.height = 256;
    const ctx = out.getContext('2d'), f = 256 / CROP, s = cropS0 * cropZ;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,256,256);
    ctx.drawImage(cropImg, cropX*f, cropY*f, cropImg.naturalWidth*s*f, cropImg.naturalHeight*s*f);
    draft.photo = out.toDataURL('image/jpeg', .86);
    closeCrop();
    refreshProfileUI();
    toast('Photo ready. Save changes to keep it.');
  };
})();

/* ---------------- settings ---------------- */
function loadSettings(){
  $('setConsent').checked = !!profile.consent;
  $('setTts').checked = ttsOn;
  $('setApiBase').value = aiCfg.base || ''; $('setModel').value = aiCfg.model || ''; $('setApiKey').value = aiCfg.key || '';
  $('setLang').value = profile.lang || 'en';
  $('setFr').value = profile.fr || ''; $('setFrP').value = profile.frP || ''; $('setThP').value = profile.thP || '';
  $('ttsToggle').checked = ttsOn;
}
$('setConsent').onchange = e => {
  profile.consent = e.target.checked; store.set('profile', profile);
  toast(profile.consent ? 'Telemetry consent granted. Listening to the body 🔓' : 'Telemetry revoked. Sahara will stop reading your signals');
  renderDash();
};
$('setTts').onchange = e => { ttsOn = e.target.checked; store.set('tts', ttsOn); $('ttsToggle').checked = ttsOn; };
$('saveSettings').onclick = () => {
  aiCfg = { base: $('setApiBase').value.trim(), key: $('setApiKey').value.trim(), model: $('setModel').value.trim() || 'gpt-4o-mini' };
  profile.lang = $('setLang').value;
  store.set('aicfg', aiCfg); store.set('profile', profile);
  $('langNote').textContent = LANG_NAMES[profile.lang] || 'English';
  toast(aiCfg.base && aiCfg.key ? 'AI connected ✨ Sahara\'s brain is live' : 'Saved. Running on the offline engine.');
};
$('saveContacts').onclick = () => {
  profile.fr = $('setFr').value.trim(); profile.frP = $('setFrP').value.trim(); profile.thP = $('setThP').value.trim();
  store.set('profile', profile); toast('Safety net updated 🤝');
};
$('btnSim').onclick = () => {
  for(let i=1; i<=4; i++){
    const idx = vitals.length - i;
    vitals[idx].stress = Math.min(92, 70 + Math.round(Math.random()*20));
    vitals[idx].hr = Math.round(88 + Math.random()*14);
    vitals[idx].sleep = Math.max(4, vitals[idx].sleep - 2);
  }
  store.set('vitals', vitals); renderAll();
  toast('Distress episode simulated. Check the dashboard and report.');
};
$('btnReset').onclick = () => {
  if(confirm('Erase all local Sahara data and restart onboarding?')){
    try{ Object.keys(localStorage).filter(k => k.startsWith('sahara_')).forEach(k => localStorage.removeItem(k)); }catch(e){}
    location.reload();
  }
};

/* ---------------- misc ---------------- */
let toastT;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}
function renderAll(){ renderDash(); renderCheckin(); renderReport(); renderChats(); renderProfileStats(); }

/* passively simulated live HR jitter every 8s (The Pulse) */
setInterval(() => {
  if(!profile || !profile.consent || !vitals) return;
  const t = vitals[vitals.length-1];
  t.hr = Math.max(58, Math.min(120, t.hr + Math.round(Math.random()*4 - 2)));
  store.set('vitals', vitals);
}, 8000);

/* ---------------- falling leaves from a tree (decorative) ---------------- */
(function fallingLeaves(){
  const cv = $('leaves');
  if(!cv || !cv.getContext || reduce.matches) return;   // reduced motion: no ambient movement at all
  const ctx = cv.getContext('2d');
  const PALETTE = ['#7FAF95', '#A3C49A', '#D7B06E', '#E0A3AE', '#9FBFB0'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  let W = 0, H = 0, tips = [], branches = [], leaves = [], last = 0, t = 0;

  // A branch that grows from the top-right corner and splits until it ends in a canopy tip.
  function grow(x, y, ang, len, depth){
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    branches.push({ x1: x, y1: y, x2, y2, w: Math.max(.6, depth * 1.2) });
    if(depth === 0){ tips.push({ x: x2, y: y2 }); return; }
    grow(x2, y2, ang - rnd(.28, .5), len * rnd(.66, .74), depth - 1);
    grow(x2, y2, ang + rnd(.22, .45), len * rnd(.64, .72), depth - 1);
  }
  function buildTree(){
    branches = []; tips = [];
    const len = Math.min(W, H) * .2;
    grow(W - Math.min(W * .1, 120), -8, Math.PI / 2 + .25, len, 5);
  }

  // A leaf is born at one of the canopy tips (or anywhere on the first frame) and drifts down.
  function spawn(first){
    const tip = tips.length ? tips[Math.floor(Math.random() * tips.length)] : { x: W * .85, y: 90 };
    return {
      bx: first ? rnd(0, W) : tip.x + rnd(-24, 24),
      y:  first ? rnd(0, H) : tip.y + rnd(-8, 12),
      vy: rnd(26, 50),                       // pixels per second
      sway: rnd(0, Math.PI * 2), amp: rnd(8, 22), fq: rnd(.5, 1.1),
      rot: rnd(0, Math.PI * 2), vr: rnd(-1.3, 1.3),
      s: rnd(5, 8), c: PALETTE[Math.floor(Math.random() * PALETTE.length)], o: rnd(.45, .75)
    };
  }

  function frame(now){
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; t += dt;
    ctx.clearRect(0, 0, W, H);

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(46,96,88,.14)';
    for(const b of branches){
      ctx.lineWidth = b.w;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }

    for(let i = 0; i < leaves.length; i++){
      const L = leaves[i];
      L.y += L.vy * dt;
      L.rot += L.vr * dt;
      if(L.y > H + 16){ leaves[i] = spawn(false); continue; }
      const x = L.bx + Math.sin(t * L.fq + L.sway) * L.amp;
      ctx.save();
      ctx.globalAlpha = L.o;
      ctx.translate(x, L.y); ctx.rotate(L.rot);
      ctx.fillStyle = L.c;
      ctx.beginPath(); ctx.ellipse(0, 0, L.s, L.s * .5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(-L.s * .8, 0); ctx.lineTo(L.s * .8, 0); ctx.stroke();
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  function size(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildTree();
    const n = Math.round(Math.max(8, Math.min(18, W / 80)));
    leaves = Array.from({ length: n }, () => spawn(true));
  }
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(size, 150); });
  size();
  requestAnimationFrame(frame);
})();

/* boot */
showStep(0);
if(profile){ enterApp(false); loadSettings(); }
