/* ===================== BUX Fuel — app.js ===================== */
'use strict';

/* ---------- אחסון ---------- */
const KEYS = { profile:'bux_profile', logs:'bux_logs', weights:'bux_weights', streak:'bux_streak', chat:'bux_chat', meals:'bux_meals' };
// פרופיל (יעדים) נכתב בנפרד (pushProfile) כדי שלא ידרוס שינויים של המאמן.
const SYNC_KEYS = new Set([KEYS.logs, KEYS.weights, KEYS.streak, KEYS.meals]);
let suppressSync = false;
const store = {
  get(k, def){ try{ const v=localStorage.getItem(k); return v==null?def:JSON.parse(v); }catch(e){ return def; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); if(SYNC_KEYS.has(k)) syncPush(); }
};

/* ===================== ענן: חשבונות + סנכרון ===================== */
const CLOUD = {
  db:   (window.BUX_CONFIG&&window.BUX_CONFIG.firebaseDB)||'',
  node: (window.BUX_CONFIG&&window.BUX_CONFIG.firebaseNode)||'bux-fuel',
  pin:  (window.BUX_CONFIG&&window.BUX_CONFIG.coachPin)||'bux2026',
};
const cloudOn = ()=> !!CLOUD.db;
let USER=null; try{ USER=JSON.parse(localStorage.getItem('bux_user')||'null'); }catch(e){}

function uurl(p){ return `${CLOUD.db}/${CLOUD.node}/${p}.json`; }
async function cloudGet(p){ try{ const r=await fetch(uurl(p),{cache:'no-store'}); return r.ok?await r.json():null; }catch(e){ return null; } }
async function cloudPut(p,v){ try{ const r=await fetch(uurl(p),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)}); return r.ok; }catch(e){ return false; } }
async function cloudPatch(p,v){ try{ const r=await fetch(uurl(p),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)}); return r.ok; }catch(e){ return false; } }
async function cloudFetchUsers(){ const o=await cloudGet('users')||{}; return Object.entries(o).map(([uid,v])=>({uid,...v})); }
async function sha(s){ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s+'::buxfuel')); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }

let pushT=null;
function syncPush(){
  if(!cloudOn() || !USER || suppressSync) return;
  setSync('☁️ שומר...');
  clearTimeout(pushT);
  pushT=setTimeout(async()=>{
    // עדכון חלקי (PATCH) — רק הנתונים של המתאמן, בלי לגעת ב-profile (היעדים של המאמן)
    const patch={ logs:store.get(KEYS.logs,{}), weights:store.get(KEYS.weights,[]),
      streak:store.get(KEYS.streak,{}), meals:store.get(KEYS.meals,[]), updatedAt:Date.now() };
    const ok=await cloudPatch('users/'+USER.uid, patch);
    setSync(ok?'☁️ מסונכרן':'⚠️ לא מסונכרן');
  },700);
}
// כתיבת שדות פרופיל בנפרד (מיזוג, לא דריסה) — נקרא באונבורדינג ובשקילה
async function pushProfile(obj){ if(!cloudOn()||!USER) return; const ok=await cloudPatch('users/'+USER.uid+'/profile', obj); setSync(ok?'☁️ מסונכרן':'⚠️ לא מסונכרן'); }
function setSync(t){ const e=document.getElementById('sync-dot'); if(e) e.textContent=t; }

async function pullUser(uid){
  const u=await cloudGet('users/'+uid); if(!u) return;
  suppressSync=true;
  store.set(KEYS.profile, u.profile||null);
  store.set(KEYS.logs, u.logs||{});
  store.set(KEYS.weights, u.weights||[]);
  store.set(KEYS.streak, u.streak||{current:0,longest:0,lastLogDate:null});
  store.set(KEYS.meals, u.meals||[]);
  suppressSync=false;
}
function setUser(u){ USER=u; try{ localStorage.setItem('bux_user',JSON.stringify(u)); }catch(e){} }
function logout(){
  USER=null;
  try{ localStorage.removeItem('bux_user'); }catch(e){}
  [KEYS.profile,KEYS.logs,KEYS.weights,KEYS.streak,KEYS.chat,KEYS.meals].forEach(k=>localStorage.removeItem(k));
  setCoach(false);
  nav('login');
}
const R = Math.round;
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

/* ---------- תאריך ---------- */
function todayKey(d){ const t=d||new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }
function heDate(){ try{ return new Date().toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'}); }catch(e){ return todayKey(); } }
function greeting(){ const h=new Date().getHours(); if(h<11) return 'בוקר טוב'; if(h<16) return 'צהריים טובים'; if(h<19) return 'אחר צהריים טובים'; return 'ערב טוב'; }

/* ---------- פרופיל / לוג ---------- */
function getProfile(){ return store.get(KEYS.profile, null); }
function saveProfile(p){ store.set(KEYS.profile, p); }
function blankLog(){ return { meals:[], activities:[], water:0, weight:null, feedbackNote:'' }; }
function getLog(date){ const logs=store.get(KEYS.logs,{}); return logs[date||todayKey()] || blankLog(); }
function saveLog(date, log){ const logs=store.get(KEYS.logs,{}); logs[date||todayKey()]=log; store.set(KEYS.logs, logs); }
function todayLog(){ return getLog(todayKey()); }

/* ---------- מצב מאמן ---------- */
function isCoach(){ return sessionStorage.getItem('bux_coach')==='1'; }
function setCoach(v){ if(v) sessionStorage.setItem('bux_coach','1'); else sessionStorage.removeItem('bux_coach'); }

/* ---------- חישובי היום ---------- */
function totals(log){
  const t={kcal:0,protein:0,carbs:0,fat:0,burn:0};
  (log.meals||[]).forEach(m=>{ t.kcal+=+m.kcal||0; t.protein+=+m.protein||0; t.carbs+=+m.carbs||0; t.fat+=+m.fat||0; });
  (log.activities||[]).forEach(a=>{ t.burn+=+a.kcalBurned||0; });
  return t;
}
function calorieBudget(p,t){ return (+p.calorieTarget||0) + ((p.addExerciseToBudget?t.burn:0)); }

/* ===================== מנוע ה-AI ===================== */
function workerBase(){ return ((window.BUX_CONFIG&&window.BUX_CONFIG.workerUrl)||'').replace(/\/$/,''); }
function isDemo(){ return !workerBase(); }
async function aiPost(path, body){
  const base=workerBase();
  if(!base) return null;
  const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok){ const tx=await res.text().catch(()=> ''); throw new Error('AI '+res.status+' '+tx); }
  return res.json();
}
async function analyzeMeal(text){ const r=await aiPost('/analyze-meal',{text}); return r||demoMeal(text); }
async function analyzeActivity(text,weight){ const r=await aiPost('/analyze-activity',{text,weight}); return r||demoActivity(text,weight); }
async function coachFeedback(ctx,p,t){ const r=await aiPost('/coach',{mode:'feedback',context:ctx}); return (r&&r.text)||demoFeedback(p,t); }
async function coachChat(messages,ctx){ const r=await aiPost('/coach',{messages,context:ctx}); return (r&&r.text)||demoChat(messages); }

/* ---------- מנוע הדגמה: ארוחות ---------- */
// ערכים: per='100g' (ל-100 גרם) או 'unit' (ליחידה/מנה). [kcal,protein,carbs,fat]
const DEMO_FOODS = [
  ['חזה עוף','100g',[165,31,0,3.6]],['עוף','100g',[200,25,0,11]],['הודו','100g',[135,29,0,1]],
  ['בשר','100g',[250,26,0,16]],['סטייק','100g',[271,25,0,19]],['המבורגר','unit',[300,17,20,17]],
  ['סלמון','100g',[208,20,0,13]],['טונה','unit',[180,40,0,1]],['דג','100g',[140,20,0,6]],
  ['ביצה','unit',[78,6,0.6,5]],['ביצים','unit',[78,6,0.6,5]],['חביתה','unit',[160,12,1,11]],
  ['אורז','100g',[130,2.7,28,0.3]],['פסטה','100g',[157,6,30,1]],['קוסקוס','100g',[112,4,23,0.2]],
  ['תפוח אדמה','100g',[87,2,20,0.1]],['פירה','100g',[90,2,15,3]],['בטטה','100g',[90,2,21,0.1]],
  ['פיתה','unit',[270,9,55,1.2]],['לאפה','unit',[330,11,66,2]],['לחם','unit',[80,3,15,1]],['פרוסת לחם','unit',[80,3,15,1]],
  ['חומוס','100g',[170,8,15,9]],['טחינה','unit',[90,3,3,8]],['פלאפל','unit',[57,2,5,3]],
  ['שניצל','unit',[220,16,12,12]],['בורקס','unit',[300,6,28,18]],['במבה','unit',[130,4,12,8]],
  ['קוטג','100g',[100,11,4,5]],['גבינה לבנה','100g',[80,9,4,3]],['גבינה צהובה','unit',[60,4,0.5,5]],['לבנה','100g',[150,6,4,12]],
  ['יוגורט','unit',[110,6,15,3]],['חלב','100g',[42,3.4,5,1]],['קממבר','100g',[300,20,0.5,24]],
  ['סלט','unit',[60,2,8,3]],['ירקות','unit',[45,2,8,0.5]],['מלפפון','unit',[16,0.7,3.6,0.1]],['עגבניה','unit',[22,1,4.8,0.2]],
  ['אבוקדו','unit',[160,2,9,15]],['בננה','unit',[105,1.3,27,0.4]],['תפוח','unit',[95,0.5,25,0.3]],['תמר','unit',[20,0.2,5,0]],
  ['שקדים','unit',[170,6,6,15]],['אגוזים','unit',[185,4,4,18]],['חמאת בוטנים','unit',[95,4,3,8]],
  ['שוקולד','unit',[230,3,25,13]],['עוגה','unit',[350,4,50,15]],['גלידה','unit',[210,4,24,11]],['ביסקוויט','unit',[50,0.7,8,2]],
  ['קפה','unit',[10,0.5,1,0.2]],['קפה הפוך','unit',[90,5,9,4]],['מיץ','unit',[110,1,26,0]],['קולה','unit',[140,0,39,0]],
  ['פיצה','unit',[285,12,36,10]],['סושי','unit',[45,2,8,1]],['שווארמה','unit',[450,28,30,24]],
  ['קורנפלקס','unit',[150,3,30,1]],['גרנולה','unit',[200,5,30,7]],['קוואקר','unit',[150,5,27,3]],['שיבולת שועל','unit',[150,5,27,3]],
];
const QTY_WORDS = { 'חצי':0.5,'רבע':0.25,'שליש':0.33,'שני':2,'שתי':2,'שתיים':2,'שלוש':3,'שלושה':3,'ארבע':4,'ארבעה':4,'חמש':5,'חמישה':5 };
const PLATE = { 'צלחת':2.8,'מנה':2,'קערה':2.5,'כוס':2,'כף':0.18,'כפית':0.06,'חופן':0.3,'פרוסה':1,'פרוסות':1 };

function demoMeal(text){
  const segs = String(text||'').split(/[,،\n]|\sו\b|\sעם\s|\+/).map(s=>s.trim()).filter(Boolean);
  const items=[]; const total={kcal:0,protein:0,carbs:0,fat:0};
  segs.forEach(seg=>{
    const food = DEMO_FOODS.find(f=> seg.includes(f[0]));
    let qty=1, grams=null;
    const gm = seg.match(/(\d+(?:\.\d+)?)\s*(?:גרם|ג'|ג\b|g)/i); if(gm) grams=+gm[1];
    const ml = seg.match(/(\d+(?:\.\d+)?)\s*(?:מ"ל|מל|ml)/i); if(ml) grams=+ml[1];
    const num = seg.match(/(\d+(?:\.\d+)?)/); if(num && !grams) qty=+num[1];
    for(const w in QTY_WORDS){ if(seg.includes(w)) qty=QTY_WORDS[w]; }
    let plateMul=1; for(const w in PLATE){ if(seg.includes(w)) plateMul=PLATE[w]; }
    let v=[150,5,18,5], name=seg.slice(0,24);
    if(food){
      name=food[0]; const base=food[2];
      if(food[1]==='100g'){ const g = grams!=null ? grams : (plateMul>1?plateMul*100:150); v=base.map(x=> x*g/100); }
      else { const mult = grams!=null ? grams/100 : qty*plateMul; v=base.map(x=> x*mult); }
    } else {
      v=v.map(x=> x*qty*plateMul);
    }
    const it={ name, kcal:R(v[0]), protein:R(v[1]), carbs:R(v[2]), fat:R(v[3]) };
    items.push(it); total.kcal+=it.kcal; total.protein+=it.protein; total.carbs+=it.carbs; total.fat+=it.fat;
  });
  total.kcal=R(total.kcal); total.protein=R(total.protein); total.carbs=R(total.carbs); total.fat=R(total.fat);
  return { items, total, note:'הערכה מהירה — אפשר לכוונן את המספרים לפני שמירה. Let\'s Go BUX 🦌', _demo:true };
}

/* ---------- מנוע הדגמה: אימונים ---------- */
const METS = [
  [/(ריצ|לרוץ|רץ)/,9.8],[/(הליכ|ללכת|הולך|צעד)/,3.8],[/קרוספיט/,8.0],[/מטקות/,5.0],
  [/(שחי|בריכ)/,7.0],[/(אופני|רכיב)/,7.5],[/יוגה/,2.8],[/(משקול|כושר|חדר כושר|הרמ)/,5.0],
  [/(ריקוד|זומבה)/,6.0],[/כדורגל/,7.5],[/כדורסל/,6.5],[/טניס/,7.0],[/(קפיצ|חבל)/,11.0],
  [/(אגרוף|בוקס|קיק)/,8.5],[/(ספינינג)/,8.0],[/(טיול|הרים)/,6.0],
];
function demoActivity(text,weight){
  const w = +weight||75; const s=String(text||'');
  let met=5.0; for(const [re,m] of METS){ if(re.test(s)){ met=m; break; } }
  let minutes=null;
  if(/חצי\s*שע/.test(s)) minutes=30; else if(/שעה\s*וחצי/.test(s)) minutes=90;
  else { const hh=s.match(/(\d+(?:\.\d+)?)\s*שע/); if(hh) minutes=+hh[1]*60; }
  if(minutes==null){ const mm=s.match(/(\d+)\s*(?:דק|דקות|min)/); if(mm) minutes=+mm[1]; }
  if(minutes==null){ const km=s.match(/(\d+(?:\.\d+)?)\s*(?:ק"מ|קמ|km|קילומ)/); if(km) minutes = +km[1]* (met>=9?6:11); }
  if(minutes==null) minutes=45;
  if(/(חזק|אינטנסיב|עצים|קשה)/.test(s)) met*=1.15;
  if(/(קל|רגוע|נינוח)/.test(s)) met*=0.85;
  const kcal = R(met*3.5*w/200*minutes);
  return { activity:s.slice(0,30)||'אימון', minutes:R(minutes), kcalBurned:kcal, note:'הערכה לפי MET ומשקל הגוף 🦌', _demo:true };
}

/* ---------- מנוע הדגמה: משוב וצ'אט ---------- */
function demoFeedback(p,t){
  const cal=+p.calorieTarget||2000, prot=+p.proteinTarget||130;
  const pPct=t.protein/prot, cPct=t.kcal/cal;
  let s;
  if(t.kcal===0) s='עוד לא רשמת היום — בוא נתחיל ברגל ימין, תזין את הארוחה הראשונה 🦌';
  else if(pPct<0.5) s=`אתה ב-${R(t.protein)} ג' חלבון מתוך ${prot} — שווה לדחוף עוד מקור חלבון טוב להמשך היום 💪🦌`;
  else if(cPct>1.12) s='עברת קצת את יעד הקלוריות — לא נורא, מחר מאזנים. שתייה והליכה קלה יעשו טוב 🦌';
  else if(cPct<0.55 && new Date().getHours()>=18) s='אכלת מעט מהיעד היום — תוסיף ארוחה מזינה שתסגור את היום נכון 🦌';
  else s='אתה בכיוון מצוין — ממשיכים ככה, עקביות זה השם של המשחק! Let\'s Go BUX 🦌';
  return s;
}
function demoChat(messages){
  const last=(messages[messages.length-1]&&messages[messages.length-1].content||'').toString();
  const p=getProfile()||{}; const t=totals(todayLog());
  const prot=+p.proteinTarget||130;
  let ans;
  if(/אחרי.*אימון|אימון.*אחרי|התאוששות/.test(last)) ans='אחרי אימון כדאי שילוב של חלבון ופחמימה תוך שעה: למשל יוגורט עם פרי ושיבולת שועל, או חזה עוף עם אורז. זה ממלא את המאגרים ובונה שריר.';
  else if(/רעב.*לילה|לילה.*רעב|בערב/.test(last)) ans='רעב בלילה זה לגיטימי — תבחר משהו עתיר חלבון ודל קלוריות: קוטג\' או יוגורט, ביצה קשה, או ירקות עם טחינה. משביע בלי לפוצץ את היום.';
  else if(/חלבון/.test(last)) ans=`כדי להגיע ליעד ${prot} ג' חלבון, פזר על פני היום: בוקר עם ביצים/קוטג\', צהריים מנת בשר/עוף/דג, וערב יוגורט או שייק. כרגע אתה על ${R(t.protein)} ג'.`;
  else if(/חומוס/.test(last)) ans='חומוס זה מצוין כמקור חלבון צמחי ושומן בריא — רק שים לב לכמות הטחינה והשמן. צלחת בינונית עם הרבה ירקות וקצת פחות פיתה, ואתה מסודר.';
  else if(/(לרזות|ירידה|שומן|דיאט)/.test(last)) ans='לירידה בריאה: גירעון קלורי מתון, הרבה חלבון לשובע ושמירת שריר, ירקות בכל ארוחה, ולא לוותר על שינה. בלי קיצוניות — זה מה שמחזיק לאורך זמן.';
  else ans='אני כאן בשבילך 💪 ספר לי מה אכלת או מה המטרה כרגע, ואכוון אותך בול. עקביות מנצחת כל דיאטה.';
  return ans + (isDemo()? '\n\n(מצב הדגמה — אחרי חיבור ה-Worker התשובות יהיו מ-Claude עצמו) 🦌' : ' Let\'s Go BUX 🦌');
}

/* ===================== ניווט ===================== */
const SUB_SCREENS = ['login','onboarding','meal','activity','dashboard'];
let current='home';
function nav(screen){
  current=screen;
  document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
  const el=document.getElementById('screen-'+screen); if(el) el.classList.add('active');
  document.getElementById('tabbar').style.display = SUB_SCREENS.includes(screen)?'none':'grid';
  document.querySelectorAll('.tab').forEach(tb=> tb.classList.toggle('active', tb.dataset.nav===screen));
  window.scrollTo(0,0);
  render(screen);
}
function render(screen){
  if(screen==='login') renderLogin();
  else if(screen==='dashboard') renderDashboard();
  else if(screen==='onboarding') renderOnboarding();
  else if(screen==='home') renderHome();
  else if(screen==='meal') renderMeal();
  else if(screen==='activity') renderActivity();
  else if(screen==='coach') renderCoach();
  else if(screen==='progress') renderProgress();
  else if(screen==='profile') renderProfile();
}

/* ===================== טבעת SVG ===================== */
function ringSVG(pct){
  const r=95, c=2*Math.PI*r, off=c*(1-clamp(pct,0,1));
  return `<svg width="230" height="230" viewBox="0 0 230 230">
    <circle class="track" cx="115" cy="115" r="${r}"></circle>
    <circle class="fill" cx="115" cy="115" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${off}"></circle>
  </svg>`;
}

/* ===================== מסך בית ===================== */
function renderHome(){
  const p=getProfile(); if(!p){ nav('onboarding'); return; }
  const log=todayLog(); const t=totals(log);
  const budget=calorieBudget(p,t);
  const left=budget - t.kcal;
  const pct=t.kcal/(budget||1);
  const st=store.get(KEYS.streak,{current:0});
  const waterTargetMl=(+p.waterTarget||2.5)*1000;
  const cups=8, perCup=waterTargetMl/cups, filled=clamp(Math.round(log.water/perCup),0,cups);

  const macro=(label,val,target,cls)=>{
    const tg=+target||1; const w=clamp(val/tg*100,0,100);
    return `<div class="macro ${cls}">
      <div class="mlabel">${label}</div>
      <div class="mval">${R(val)}<span style="font-size:13px;color:var(--muted);font-weight:700">/${R(tg)}</span></div>
      <div class="mbar"><i style="width:${w}%"></i></div>
    </div>`;
  };

  document.getElementById('home-body').innerHTML = `
    <div class="hello">
      <h1>${greeting()}, <span>${esc(p.name||'אלוף')}</span> 🦌</h1>
      <div class="sub">${heDate()}${isDemo()?' · <span class="demo-pill">מצב הדגמה</span>':''}</div>
    </div>

    <div class="card">
      <div class="cal-ring-wrap">
        <div class="ring">
          ${ringSVG(pct)}
          <div class="center">
            <div class="big">${R(t.kcal)}</div>
            <div class="of">מתוך ${R(budget)} קל'</div>
            <div class="lbl">קלוריות היום</div>
            <div class="left">${left>=0?`נשארו ${R(left)}`:`חריגה של ${R(-left)}`}</div>
          </div>
        </div>
      </div>
      <div class="macros">
        ${macro('חלבון (ג\')',t.protein,p.proteinTarget,'protein')}
        ${macro('פחמימה (ג\')',t.carbs,p.carbTarget,'')}
        ${macro('שומן (ג\')',t.fat,p.fatTarget,'')}
      </div>
    </div>

    <div class="card coach-card" id="coach-card">
      <div class="ctop">🦌 מאמן BUX</div>
      <p id="coach-line"><span class="spinner" style="width:18px;height:18px;border-width:3px;display:inline-block;vertical-align:middle"></span> מחשב את הדלק שלך...</p>
    </div>

    <div class="stat-row">
      <div class="stat">
        <div class="s-top">🔥 שריפה היום</div>
        <div class="s-val">${R(t.burn)}<small> קל'</small></div>
        <div class="s-sub">${p.addExerciseToBudget?'מתווסף לתקציב':'לידיעה בלבד'}</div>
      </div>
      <div class="stat">
        <div class="s-top">⚡ רצף</div>
        <div class="s-val">${st.current||0}<small> ימים</small></div>
        <div class="s-sub">${(st.current||0)>0?'ממשיכים!':'מתחילים היום'}</div>
      </div>
    </div>

    <div class="card tight">
      <h3>💧 מים — ${(log.water/1000).toFixed(1)} / ${(+p.waterTarget||2.5)} ליטר</h3>
      <div class="water-cups">
        ${Array.from({length:cups},(_,i)=>`<div class="cup ${i<filled?'full':''}" data-act="water-set" data-i="${i}"></div>`).join('')}
      </div>
      <div class="water-actions">
        <button class="btn ghost sm" data-act="water-add" data-ml="250">＋ כוס (250)</button>
        <button class="btn ghost sm" data-act="water-add" data-ml="-250">－</button>
      </div>
    </div>

    ${renderTodayList(log)}

    <div class="actions">
      <button class="big-btn" data-nav="meal"><span class="ico">➕</span>הוספת ארוחה</button>
      <button class="big-btn alt" data-nav="activity"><span class="ico">🏋️</span>הוספת אימון</button>
    </div>
    <div class="foot-note">Let's Go BUX 🦌</div>
  `;

  // משוב AI אסינכרוני
  const ctx=contextString(p,log,t);
  coachFeedback(ctx,p,t).then(txt=>{ const e=document.getElementById('coach-line'); if(e) e.textContent=txt; })
    .catch(()=>{ const e=document.getElementById('coach-line'); if(e) e.textContent=demoFeedback(p,t); });
}

function renderTodayList(log){
  const meals=(log.meals||[]); const acts=(log.activities||[]);
  if(!meals.length && !acts.length) return '';
  const mealName={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  let html='<div class="card tight"><h3>📋 היומן של היום</h3>';
  meals.forEach((m,i)=>{ html+=`<div class="list-item">
    <div><div class="li-main">${esc(m.description||mealName[m.mealType]||'ארוחה')}</div>
    <div class="li-sub">${mealName[m.mealType]||''} · ${R(m.protein)} ג' חלבון</div></div>
    <div style="display:flex;align-items:center;gap:8px"><span class="li-k">${R(m.kcal)}</span>
    <button class="li-del" data-act="del-meal" data-i="${i}">🗑</button></div></div>`; });
  acts.forEach((a,i)=>{ html+=`<div class="list-item">
    <div><div class="li-main">🏋️ ${esc(a.activity||a.type||'אימון')}</div>
    <div class="li-sub">${R(a.minutes||0)} דק'</div></div>
    <div style="display:flex;align-items:center;gap:8px"><span class="li-k">-${R(a.kcalBurned)}</span>
    <button class="li-del" data-act="del-act" data-i="${i}">🗑</button></div></div>`; });
  html+='</div>'; return html;
}

function contextString(p,log,t){
  const mealName={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  const goals={fat_loss:'ירידה באחוז שומן',muscle:'עליה במסת שריר',maintain:'שמירה',performance:'ביצועים'};
  let s=`שם: ${p.name}. מטרה: ${goals[p.goal]||p.goal}. `;
  s+=`יעדים יומיים מגיא: ${p.calorieTarget} קל', ${p.proteinTarget} ג' חלבון, ${p.carbTarget} ג' פחמימה, ${p.fatTarget} ג' שומן, ${p.waterTarget} ליטר מים. `;
  s+=`עד עכשיו היום: ${R(t.kcal)} קל', ${R(t.protein)} ג' חלבון, ${R(t.carbs)} ג' פחמימה, ${R(t.fat)} ג' שומן, שריפה ${R(t.burn)} קל'. `;
  if((log.meals||[]).length) s+='אכל היום: '+log.meals.map(m=>`${mealName[m.mealType]||''} ${m.description}`).join('; ')+'. ';
  if(p.menuPlan&&p.menuPlan.length) s+='התפריט של גיא: '+p.menuPlan.map(m=>`${mealName[m.meal]||m.meal}: ${m.description}`).join('; ')+'. ';
  if(p.notes) s+='הערות מגיא: '+p.notes+'. ';
  return s;
}

/* ===================== מסך הוספת ארוחה (מאגר משרד הבריאות) ===================== */
let FOODS=null, FOODS_LOADING=null;
let mealItems=[], currentMealType='breakfast', mealMode='search', portionFood=null;
const MEAL_TYPES=[['breakfast','בוקר'],['lunch','צהריים'],['dinner','ערב'],['snack','ביניים']];

async function loadFoods(){
  if(FOODS) return FOODS;
  if(!FOODS_LOADING) FOODS_LOADING=fetch('./data/foods.json').then(r=>r.json()).then(d=>{FOODS=d;return d;}).catch(()=>{FOODS=[];return [];});
  return FOODS_LOADING;
}
function mealTotals(){ return mealItems.reduce((t,i)=>{t.kcal+=i.kcal;t.protein+=i.protein;t.carbs+=i.carbs;t.fat+=i.fat;return t;},{kcal:0,protein:0,carbs:0,fat:0}); }
function foodById(id){ return FOODS && FOODS.find(f=>f.i===+id); }

/* ---------- למידת ארוחות (ארוחות מהירות/אחרונות) ---------- */
function getMeals(){ return store.get(KEYS.meals, []); }
function mealSig(items){ return items.map(i=>`${i.name}|${i.grams||i.qty||''}`).sort().join('~'); }
function mealScore(m){ const days=(Date.now()-(m.last||0))/864e5; return (m.count||1)*10 - days*0.4; }
function rememberMeal(items, mealType){
  const lib=getMeals(); const sig=mealSig(items);
  const ex=lib.find(m=>m.sig===sig);
  if(ex){ ex.count=(ex.count||1)+1; ex.last=Date.now(); ex.mealType=mealType; }
  else {
    const tot=items.reduce((s,i)=>s+(+i.kcal||0),0);
    lib.push({ sig, items:items.slice(), mealType, count:1, last:Date.now(),
      label: items.map(i=>{
        let nm=i.name.split(',')[0].trim(); if(nm.length>16) nm=nm.slice(0,16)+'…';
        const m=(i.qty||'').match(/^(\d+(?:\.\d+)?)\s+(.+)/);
        const q=(m && !m[2].startsWith('ג'))? m[1]+'× ' : '';
        return q+nm;
      }).join(' + ').slice(0,90),
      kcal: R(tot) });
  }
  lib.sort((a,b)=>mealScore(b)-mealScore(a));
  store.set(KEYS.meals, lib.slice(0,40));
}
function topMeals(n){ return getMeals().slice().sort((a,b)=>mealScore(b)-mealScore(a)).slice(0,n||6); }
function loadMeal(sig){
  const m=getMeals().find(x=>x.sig===sig); if(!m) return;
  if(m.mealType) currentMealType=m.mealType;
  m.items.forEach(it=> mealItems.push({...it}));
  toast('נטען! אפשר לשמור 🦌'); buildMealUI();
  window.scrollTo(0,document.body.scrollHeight);
}
function forgetMeal(sig){ store.set(KEYS.meals, getMeals().filter(x=>x.sig!==sig)); buildMealUI(); }
function frequentMealsHTML(){
  const ms=topMeals(6); if(!ms.length) return '';
  const mn={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  return `<div class="card"><h3>🔁 הארוחות שלך — בחירה מהירה</h3>
    ${ms.map(m=>`<div class="list-item" data-act="meal-load" data-sig="${esc(m.sig)}" style="cursor:pointer">
      <div style="flex:1"><div class="li-main" style="font-size:14px">${esc(m.label)}</div>
        <div class="li-sub">${mn[m.mealType]||''} · נאכל ${m.count}×</div></div>
      <div style="display:flex;align-items:center;gap:8px"><span class="li-k">${R(m.kcal)}</span>
        <button class="li-del" data-act="meal-forget" data-sig="${esc(m.sig)}">🗑</button></div></div>`).join('')}
    <div class="hint" style="margin-top:8px">לחיצה טוענת את כל הארוחה — ואז רק לשמור 🦌</div></div>`;
}

async function renderMeal(){
  const h=new Date().getHours();
  currentMealType = h<11?'breakfast': h<16?'lunch': h<21?'dinner':'snack';
  mealItems=[]; mealMode='search';
  document.getElementById('meal-body').innerHTML=`<div class="card"><div class="loading"><div class="spinner"></div><div>טוען את מאגר המזון... 🦌</div></div></div>`;
  await loadFoods();
  buildMealUI();
}

function buildMealUI(){
  const tot=mealTotals();
  document.getElementById('meal-body').innerHTML=`
    ${frequentMealsHTML()}
    <div class="card">
      <div class="field"><label>איזו ארוחה?</label>
        <div class="chips" id="meal-types">${MEAL_TYPES.map(([v,l])=>`<button class="chip ${v===currentMealType?'on':''}" data-act="meal-type" data-val="${v}">${l}</button>`).join('')}</div>
      </div>
      <div class="chips" style="margin-bottom:12px">
        <button class="chip ${mealMode==='search'?'on':''}" data-act="meal-mode" data-val="search">🔍 חיפוש מהמאגר</button>
        <button class="chip ${mealMode==='free'?'on':''}" data-act="meal-mode" data-val="free">✍️ טקסט חופשי</button>
      </div>
      ${mealMode==='search'?`
        <div class="field" style="margin-bottom:8px">
          <input id="food-search" placeholder="חפש מאכל… לחם, חזה עוף, קוטג'" autocomplete="off">
          <div class="hint">📋 נתוני משרד הבריאות — קלוריות ומאקרו אמיתיים ל-100 גרם.</div>
        </div>
        <div class="chips" style="margin-bottom:6px">${['ביצה','לחם','אורז','חזה עוף',"קוטג'",'בננה','סלט','חלב'].map(s=>`<button class="chip" data-act="food-quick" data-val="${esc(s)}">${s}</button>`).join('')}</div>
        <div id="food-results"></div>`
      :`
        <div class="field"><textarea id="meal-text" placeholder="תאר בחופשיות: חזה עוף 200 גרם, צלחת אורז, סלט"></textarea>
          <div class="hint">הערכה מהירה (לא מהמאגר הרשמי) — לדיוק מלא העדף חיפוש.</div></div>
        <button class="btn ghost sm" data-act="analyze-meal">🦌 נתח טקסט</button>
        <div id="ft-result"></div>`}
    </div>
    <div class="card">
      <h3>🍽️ הארוחה שלי</h3>
      ${mealItems.length?mealItems.map((it,i)=>`<div class="list-item">
        <div><div class="li-main" style="font-size:14px">${esc(it.name)}</div><div class="li-sub">${esc(it.qty)} · ח ${R(it.protein)} פ ${R(it.carbs)} ש ${R(it.fat)}</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span class="li-k">${R(it.kcal)}</span><button class="li-del" data-act="item-del" data-i="${i}">🗑</button></div></div>`).join('')
        :'<div class="empty">חפש והוסף מאכלים — הם יצטברו כאן</div>'}
      ${mealItems.length?`<div class="total-line" style="margin-top:12px"><div class="li-main">סה"כ</div><div class="tk">${R(tot.kcal)}</div></div>
        <div class="hint" style="text-align:center;margin-top:6px">חלבון ${R(tot.protein)} · פחמימה ${R(tot.carbs)} · שומן ${R(tot.fat)} ג'</div>
        <button class="btn" data-act="save-meal" style="margin-top:12px">✓ שמור ארוחה</button>`:''}
    </div>`;
  const s=document.getElementById('food-search');
  if(s){ s.addEventListener('input',()=>renderFoodResults(s.value)); s.focus(); }
}

const PROCESSED_RE=/מיובש|אבקת|אבקה|מסוכר|מטוגן|קלוי|משומר|תרכיז|תמצית|מיוחד|לתינוק|פורמולה/;
function searchFoods(q){
  q=(q||'').trim(); if(q.length<2||!FOODS) return [];
  const words=q.split(/\s+/); const w0=words[0]; const res=[];
  for(const f of FOODS){
    const n=f.n;
    if(!words.every(w=>n.includes(w))) continue;
    let s;
    if(n===q) s=1000;
    else if(n.startsWith(q)) s=700-n.length*0.3;
    else { const toks=n.split(/[ ,]+/); s=(toks.some(t=>t.startsWith(w0))?450:200)-n.length*0.3; }
    if(PROCESSED_RE.test(n)) s-=130;   // העדף מאכלים בסיסיים על פני מעובדים
    res.push([s,f]);
  }
  res.sort((a,b)=>b[0]-a[0]);
  return res.slice(0,30).map(x=>x[1]);
}
function renderFoodResults(q){
  const box=document.getElementById('food-results'); if(!box) return;
  if(!q || q.trim().length<2){ box.innerHTML=''; return; }
  const res=searchFoods(q);
  box.innerHTML=res.length?res.map(f=>`<div class="list-item" data-act="food-pick" data-i="${f.i}" style="cursor:pointer">
    <div><div class="li-main" style="font-size:14px">${esc(f.n)}</div><div class="li-sub">ל-100 ג': ח ${R(f.p)} פ ${R(f.c)} ש ${R(f.f)}</div></div>
    <div class="li-k">${R(f.k)}</div></div>`).join('')
    :'<div class="empty">לא נמצא — נסה מילה אחרת</div>';
}

function openPortion(id){
  const f=foodById(id); if(!f) return; portionFood=f;
  const hasUnit=f.u&&Object.keys(f.u).length;
  const units=[['גרם',1],...Object.entries(f.u||{})];
  const defIdx=hasUnit?1:0;
  showModal(`<h2 style="font-size:19px;line-height:1.3">${esc(f.n)}</h2>
    <p style="font-size:13px">בחר כמות — חישוב מהמאגר הרשמי 🦌</p>
    <div class="row2" style="text-align:right">
      <div class="field"><label>כמות</label><input id="pt-amt" type="number" step="${hasUnit?'0.25':'10'}" value="${hasUnit?1:100}" inputmode="decimal"></div>
      <div class="field"><label>יחידה</label><select id="pt-unit">${units.map(([u,g],i)=>`<option value="${g}" ${i===defIdx?'selected':''}>${esc(u)}${g!==1?` (${R(g)} ג')`:''}</option>`).join('')}</select></div>
    </div>
    <div class="total-line" style="margin:4px 0 14px"><div class="li-main">קלוריות</div><div class="tk" id="pt-kcal">0</div></div>
    <button class="btn" data-act="portion-add">➕ הוסף לארוחה</button>
    <button class="btn ghost" data-act="close-modal" style="margin-top:8px">ביטול</button>`);
  const upd=()=>{ const amt=+document.getElementById('pt-amt').value||0; const g=+document.getElementById('pt-unit').value||1;
    const grams=amt*g; document.getElementById('pt-kcal').textContent=`${R(f.k*grams/100)} (${R(grams)} ג')`; };
  ['pt-amt','pt-unit'].forEach(id=>{ const e=document.getElementById(id); if(e){ e.addEventListener('input',upd); e.addEventListener('change',upd); } });
  upd();
}
function portionAdd(){
  const f=portionFood; if(!f) return;
  const amt=+document.getElementById('pt-amt').value||0; const sel=document.getElementById('pt-unit');
  const g=+sel.value||1; const unitName=sel.options[sel.selectedIndex].text.split(' (')[0];
  const grams=amt*g; if(grams<=0){ toast('בחר כמות'); return; }
  const fac=grams/100;
  mealItems.push({ name:f.n, qty: g===1?`${R(grams)} ג'`:`${amt} ${unitName}`, grams:R(grams),
    kcal:R(f.k*fac), protein:R(f.p*fac), carbs:R(f.c*fac), fat:R(f.f*fac) });
  portionFood=null; closeModal(); buildMealUI();
}

async function doAnalyzeMeal(){
  const text=(document.getElementById('meal-text').value||'').trim();
  if(!text){ toast('כתוב קודם מה אכלת'); return; }
  const box=document.getElementById('ft-result');
  box.innerHTML=`<div class="loading" style="padding:16px"><div class="spinner"></div><div>מחשב... 🦌</div></div>`;
  try{
    const r=await analyzeMeal(text); const t=r.total||{kcal:0,protein:0,carbs:0,fat:0};
    box.innerHTML=`<div class="analyze-result" style="margin-top:10px">
      ${(r.items||[]).map(it=>`<div class="item-line"><div class="iname">${esc(it.name)}</div><div class="ikcal">${R(it.kcal)}</div></div>`).join('')}
      <div class="row2" style="margin-top:10px">
        <div class="field" style="margin-bottom:6px"><label>קלוריות</label><input id="ed-kcal" type="number" value="${R(t.kcal)}"></div>
        <div class="field" style="margin-bottom:6px"><label>חלבון</label><input id="ed-prot" type="number" value="${R(t.protein)}"></div>
        <div class="field" style="margin-bottom:6px"><label>פחמימה</label><input id="ed-carb" type="number" value="${R(t.carbs)}"></div>
        <div class="field" style="margin-bottom:6px"><label>שומן</label><input id="ed-fat" type="number" value="${R(t.fat)}"></div>
      </div>
      <button class="btn sm" data-act="ft-add">➕ הוסף לארוחה</button></div>`;
  }catch(e){ box.innerHTML='<div class="empty">לא הצלחנו לנתח 🙁</div>'; }
}
function ftAdd(){
  const text=((document.getElementById('meal-text')||{}).value||'הערכה').trim();
  mealItems.push({ name:text.slice(0,40), qty:'הערכה',
    kcal:+document.getElementById('ed-kcal').value||0, protein:+document.getElementById('ed-prot').value||0,
    carbs:+document.getElementById('ed-carb').value||0, fat:+document.getElementById('ed-fat').value||0 });
  toast('נוסף לארוחה'); buildMealUI();
}
function saveMealCart(){
  if(!mealItems.length){ toast('הוסף קודם מאכלים'); return; }
  const tot=mealTotals(); const log=todayLog();
  log.meals.push({ time:new Date().toISOString(), mealType:currentMealType,
    description: mealItems.map(i=>`${i.name} (${i.qty})`).join(', '),
    kcal:R(tot.kcal), protein:R(tot.protein), carbs:R(tot.carbs), fat:R(tot.fat), items:mealItems.slice() });
  rememberMeal(mealItems, currentMealType);
  saveLog(todayKey(),log); bumpStreak(); mealItems=[];
  toast('הארוחה נשמרה! 🦌'); nav('home');
}

/* ===================== מסך הוספת אימון ===================== */
let lastAct=null;
function renderActivity(){
  document.getElementById('activity-body').innerHTML=`
    <div class="card">
      <div class="field">
        <label>מה עשית? כתוב בחופשיות</label>
        <textarea id="act-text" placeholder="לדוגמה: קרוספיט שעה אינטנסיבי · הליכה 40 דקות · ריצה 5 ק&quot;מ · מטקות בים חצי שעה"></textarea>
        <div class="hint">המנוע מעריך שריפת קלוריות לפי סוג הפעילות, משך, עצימות ומשקל הגוף שלך.</div>
      </div>
      <div class="chips" style="margin-bottom:14px">
        ${['קרוספיט שעה','הליכה 45 דקות','ריצה 5 ק"מ','מטקות חצי שעה'].map(s=>`<button class="chip" data-act="fill-act" data-val="${s}">${s}</button>`).join('')}
      </div>
      <button class="btn" data-act="analyze-act">🦌 חשב שריפה</button>
    </div>
    <div id="act-result"></div>
  `;
}
async function doAnalyzeAct(){
  const text=(document.getElementById('act-text').value||'').trim();
  if(!text){ toast('כתוב קודם מה עשית'); return; }
  const p=getProfile()||{}; const box=document.getElementById('act-result');
  box.innerHTML=`<div class="card"><div class="loading"><div class="spinner"></div><div>מחשב שריפה... 🦌</div></div></div>`;
  try{
    const r=await analyzeActivity(text, p.weightCurrent||75);
    lastAct=r;
    box.innerHTML=`<div class="card">
      <div class="total-line"><div><div class="li-main">${esc(r.activity)}</div>
        <div class="li-sub">${R(r.minutes)} דקות</div></div>
        <div class="tk">🔥 ${R(r.kcalBurned)}</div></div>
      ${r.note?`<div class="hint" style="margin-top:12px">💬 ${esc(r.note)}</div>`:''}
      <button class="btn" data-act="save-act" style="margin-top:14px">✓ שמור אימון</button>
    </div>`;
  }catch(e){
    box.innerHTML=`<div class="card"><div class="empty">לא הצלחנו לחשב כרגע 🙁<br><span style="font-size:12px">${esc(e.message||'')}</span></div></div>`;
  }
}
function saveAct(){
  if(!lastAct) return;
  const log=todayLog();
  log.activities.push({ type:lastAct.activity, activity:lastAct.activity, minutes:lastAct.minutes, intensity:'', kcalBurned:lastAct.kcalBurned });
  saveLog(todayKey(),log); bumpStreak(); lastAct=null;
  toast('אימון נשמר! 💪🦌'); nav('home');
}

/* ===================== צ'אט מאמן ===================== */
function renderCoach(){
  const p=getProfile(); if(!p){ nav('onboarding'); return; }
  const chat=store.get(KEYS.chat,[]);
  const sugg=['מה לאכול אחרי אימון?','איך אני משלים חלבון היום?','אני רעב בלילה, מה מותר?','צלחת חומוס בסדר למטרה שלי?'];
  document.getElementById('coach-body').innerHTML=`
    <div class="chat-wrap">
      <div class="suggestions">${sugg.map(s=>`<button data-act="chat-sugg" data-val="${esc(s)}">${s}</button>`).join('')}</div>
      <div class="chat-log" id="chat-log">
        ${chat.length?chat.map(m=>`<div class="msg ${m.role==='user'?'me':'bot'}">${esc(m.content)}</div>`).join('')
          :`<div class="msg bot">היי ${esc(p.name||'')}! אני מאמן התזונה שלך 🦌 שאל אותי כל דבר — מה לאכול, איך להשלים חלבון, או אם משהו מתאים למטרה שלך.${isDemo()?'\n\n(כרגע במצב הדגמה — חבר את ה-Worker לתשובות AI מלאות)':''}</div>`}
      </div>
      <div class="chat-input">
        <input id="chat-text" placeholder="כתוב הודעה למאמן..." autocomplete="off">
        <button class="send" data-act="chat-send">➤</button>
      </div>
    </div>`;
  const log=document.getElementById('chat-log'); log.scrollTop=log.scrollHeight;
  const inp=document.getElementById('chat-text');
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') sendChat(); });
}
async function sendChat(val){
  const inp=document.getElementById('chat-text');
  const text=(val||(inp&&inp.value)||'').trim(); if(!text) return;
  if(inp) inp.value='';
  const chat=store.get(KEYS.chat,[]);
  chat.push({role:'user',content:text}); store.set(KEYS.chat,chat);
  const logEl=document.getElementById('chat-log');
  logEl.insertAdjacentHTML('beforeend',`<div class="msg me">${esc(text)}</div>`);
  logEl.insertAdjacentHTML('beforeend',`<div class="msg bot" id="typing"><span class="spinner" style="width:16px;height:16px;border-width:3px;display:inline-block"></span></div>`);
  logEl.scrollTop=logEl.scrollHeight;
  const p=getProfile(); const tl=todayLog(); const ctx=contextString(p,tl,totals(tl));
  try{
    const reply=await coachChat(chat.slice(-12),ctx);
    document.getElementById('typing')?.remove();
    chat.push({role:'assistant',content:reply}); store.set(KEYS.chat,chat);
    logEl.insertAdjacentHTML('beforeend',`<div class="msg bot">${esc(reply)}</div>`);
    logEl.scrollTop=logEl.scrollHeight;
  }catch(e){
    document.getElementById('typing')?.remove();
    const reply=demoChat(chat.slice(-12));
    chat.push({role:'assistant',content:reply}); store.set(KEYS.chat,chat);
    logEl.insertAdjacentHTML('beforeend',`<div class="msg bot">${esc(reply)}</div>`);
  }
}

/* ===================== התקדמות ===================== */
function renderProgress(){
  const p=getProfile(); if(!p){ nav('onboarding'); return; }
  const weights=store.get(KEYS.weights,[]);
  const st=store.get(KEYS.streak,{current:0,longest:0});
  document.getElementById('progress-body').innerHTML=`
    <div class="hello"><h1>ההתקדמות שלך 📈</h1><div class="sub">כל צעד נספר 🦌</div></div>

    <div class="card">
      <h3>⚖️ משקל</h3>
      ${weightChart(p,weights)}
      <div class="row3" style="margin-top:14px;text-align:center">
        <div class="stat" style="margin:0"><div class="s-top">התחלה</div><div class="s-val">${p.weightStart||'—'}</div></div>
        <div class="stat" style="margin:0"><div class="s-top">עכשיו</div><div class="s-val">${p.weightCurrent||'—'}</div></div>
        <div class="stat" style="margin:0"><div class="s-top">יעד</div><div class="s-val">${p.weightTarget||'—'}</div></div>
      </div>
      <div class="field" style="margin-top:14px">
        <label>שקילה חדשה היום (ק"ג)</label>
        <div style="display:flex;gap:8px">
          <input id="weigh-in" type="number" step="0.1" placeholder="${p.weightCurrent||''}" style="flex:1">
          <button class="btn sm" data-act="weigh-in">שמור</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>🎯 עמידה ביעדים — 7 ימים אחרונים</h3>
      ${adherenceGrid(p)}
      <div class="hint" style="margin-top:10px">צהוב = עמדת ביעד הקלוריות והחלבון · ירקרק = חלקי</div>
    </div>

    <div class="card">
      <h3>🏆 הישגים</h3>
      <div class="stat-row" style="margin:0 0 12px">
        <div class="stat"><div class="s-top">רצף נוכחי</div><div class="s-val">${st.current||0}<small> ימים</small></div></div>
        <div class="stat"><div class="s-top">שיא רצף</div><div class="s-val">${st.longest||0}<small> ימים</small></div></div>
      </div>
      <div class="badge-row">
        ${ach('🔥','רצף 3', (st.longest||0)>=3)}
        ${ach('⚡','רצף 7', (st.longest||0)>=7)}
        ${ach('💪','רצף 14', (st.longest||0)>=14)}
        ${ach('🦌','רצף 30', (st.longest||0)>=30)}
      </div>
    </div>

    <div class="card">
      <h3>📤 דוח שבועי לגיא</h3>
      <div class="hint" style="margin-bottom:12px">סיכום אוטומטי (משקל, ממוצע קלוריות/חלבון, עמידה ביעדים) שנשלח לגיא בוואטסאפ.</div>
      <button class="btn" data-act="weekly-report">📲 שלח דוח לגיא בוואטסאפ</button>
    </div>
    <div class="foot-note">Let's Go BUX 🦌</div>
  `;
}
function ach(ico,name,unlocked){ return `<div class="ach ${unlocked?'':'locked'}"><div class="ai">${ico}</div><div class="an">${name}</div></div>`; }

function weightChart(p,weights){
  const pts=[]; if(p.weightStart) pts.push(+p.weightStart);
  weights.forEach(w=> pts.push(+w.weight));
  if(!pts.length && p.weightCurrent) pts.push(+p.weightCurrent);
  if(pts.length<2){ return `<div class="chart"><div class="empty">הוסף שקילות כדי לראות גרף 📉</div></div>`; }
  const W=300,H=120,pad=10;
  const all=pts.concat([+p.weightTarget||pts[pts.length-1]]);
  const min=Math.min(...all)-1, max=Math.max(...all)+1, rng=(max-min)||1;
  const x=i=> pad + i*(W-2*pad)/(pts.length-1);
  const y=v=> pad + (1-(v-min)/rng)*(H-2*pad);
  const line=pts.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const tgtY=y(+p.weightTarget||pts[pts.length-1]).toFixed(1);
  return `<div class="chart"><svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="overflow:visible">
    <line x1="${pad}" y1="${tgtY}" x2="${W-pad}" y2="${tgtY}" stroke="#FFD400" stroke-width="1.5" stroke-dasharray="5 5" opacity=".6"/>
    <polyline points="${line}" fill="none" stroke="#FFD400" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="#FFD400"/>`).join('')}
  </svg></div>`;
}
function adherenceGrid(p){
  const logs=store.get(KEYS.logs,{}); const days=['א','ב','ג','ד','ה','ו','ש'];
  let html='<div class="adh-grid">';
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i); const key=todayKey(d);
    const log=logs[key]; let cls='';
    if(log){ const t=totals(log); const cal=+p.calorieTarget||1; const prot=+p.proteinTarget||1;
      const calOk=t.kcal>=cal*0.8 && t.kcal<=cal*1.1; const protOk=t.protein>=prot*0.85;
      if(calOk&&protOk) cls='hit'; else if(t.kcal>0) cls='partial'; }
    html+=`<div class="adh-day ${cls}">${days[d.getDay()]}</div>`;
  }
  return html+'</div>';
}
function weeklyReport(){
  const p=getProfile(); const logs=store.get(KEYS.logs,{});
  let kcalSum=0,protSum=0,n=0;
  for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const log=logs[todayKey(d)];
    if(log&&(log.meals||[]).length){ const t=totals(log); kcalSum+=t.kcal; protSum+=t.protein; n++; } }
  const avgK=n?R(kcalSum/n):0, avgP=n?R(protSum/n):0;
  const goals={fat_loss:'ירידה בשומן',muscle:'עליה במסה',maintain:'שמירה',performance:'ביצועים'};
  const txt=`📊 דוח שבועי — BUX Fuel 🦌\n`+
    `מתאמן/ת: ${p.name}\n`+
    `מטרה: ${goals[p.goal]||p.goal}\n`+
    `משקל נוכחי: ${p.weightCurrent||'—'} ק"ג (יעד ${p.weightTarget||'—'})\n`+
    `ימים מתועדים השבוע: ${n}/7\n`+
    `ממוצע קלוריות: ${avgK} (יעד ${p.calorieTarget})\n`+
    `ממוצע חלבון: ${avgP} ג' (יעד ${p.proteinTarget})\n`+
    `Let's Go BUX 🦌`;
  const num=(p.giaWhats||'').replace(/[^0-9]/g,'');
  const url='https://wa.me/'+(num?num:'')+'?text='+encodeURIComponent(txt);
  window.open(url,'_blank');
}

/* ===================== פרופיל + מצב מאמן ===================== */
function renderProfile(){
  const p=getProfile(); if(!p){ nav('onboarding'); return; }
  const goals={fat_loss:'ירידה באחוז שומן',muscle:'עליה במסת שריר',maintain:'שמירה',performance:'ביצועים'};
  // תצוגת מתאמן (קריאה בלבד)
  const mealName={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  document.getElementById('profile-body').innerHTML=`
    <div class="hello"><h1>הפרופיל שלי 👤</h1><div class="sub">${esc(p.name)} · ${esc(goals[p.goal]||'')}</div></div>
    <div class="card">
      <h3>🎯 היעדים שלי מגיא</h3>
      <div class="macros" style="grid-template-columns:repeat(2,1fr)">
        <div class="macro protein"><div class="mlabel">קלוריות</div><div class="mval">${p.calorieTarget}</div></div>
        <div class="macro"><div class="mlabel">חלבון</div><div class="mval">${p.proteinTarget}<span style="font-size:12px">ג'</span></div></div>
        <div class="macro"><div class="mlabel">פחמימה</div><div class="mval">${p.carbTarget}<span style="font-size:12px">ג'</span></div></div>
        <div class="macro"><div class="mlabel">שומן</div><div class="mval">${p.fatTarget}<span style="font-size:12px">ג'</span></div></div>
      </div>
      <div style="text-align:center;margin-top:12px;color:var(--muted);font-weight:700">💧 יעד מים: ${p.waterTarget} ליטר · ${p.addExerciseToBudget?'שריפה מתווספת לתקציב':'שריפה לידיעה בלבד'}</div>
    </div>
    ${(p.menuPlan&&p.menuPlan.length)?`<div class="card"><h3>📖 התפריט שלי</h3>
      ${p.menuPlan.map(m=>`<div class="list-item"><div><div class="li-main">${mealName[m.meal]||m.meal}</div><div class="li-sub">${esc(m.description)}</div></div></div>`).join('')}</div>`:''}
    ${p.notes?`<div class="card"><h3>📝 הערות מגיא</h3><p style="line-height:1.6">${esc(p.notes)}</p></div>`:''}
    <div class="card">
      <h3>⚙️ החשבון שלי</h3>
      ${USER?`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div><div class="li-main">מחובר כ-${esc(USER.name)}</div><div class="li-sub"><span id="sync-dot">☁️ מסונכרן</span> · עובד מכל מכשיר</div></div>
      </div>`:''}
      <button class="btn ghost" data-act="export" style="margin-bottom:10px">💾 גיבוי הנתונים שלי</button>
      ${USER?'<button class="btn ghost" data-act="logout" style="margin-bottom:10px">🚪 התנתקות</button>':''}
      <div class="readonly-note">היעדים, התפריט וההערות נקבעים על ידי גיא. כדי לעדכן אותם — פני אליה או כנסי למצב מאמן (🔒 למעלה).</div>
    </div>
    <div class="foot-note">BUX Fuel 🦌</div>
  `;
}

function renderCoachEditor(p){
  const sexes=[['male','גבר'],['female','אישה']];
  const goalsArr=[['fat_loss','ירידה בשומן'],['muscle','עליה במסה'],['maintain','שמירה'],['performance','ביצועים']];
  const mn={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  const menu=p.menuPlan||[];
  const getMenu=(k)=> (menu.find(m=>m.meal===k)||{}).description||'';
  document.getElementById('profile-body').innerHTML=`
    <div class="coach-banner">מצב מאמן פעיל 🔓 — אפשר לערוך הכל <button class="x" data-act="coach-logout">יציאה ✕</button></div>
    <div class="hello"><h1>עריכת פרופיל</h1><div class="sub">היעדים והתפריט שגיא קובעת</div></div>

    <div class="card">
      <h3>👤 פרטים אישיים</h3>
      <div class="field"><label>שם</label><input id="f-name" value="${esc(p.name||'')}"></div>
      <div class="row3">
        <div class="field"><label>גיל</label><input id="f-age" type="number" value="${p.age||''}"></div>
        <div class="field"><label>גובה (ס"מ)</label><input id="f-height" type="number" value="${p.height||''}"></div>
        <div class="field"><label>מין</label><select id="f-sex">${sexes.map(([v,l])=>`<option value="${v}" ${p.sex===v?'selected':''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="row3">
        <div class="field"><label>משקל התחלה</label><input id="f-ws" type="number" step="0.1" value="${p.weightStart||''}"></div>
        <div class="field"><label>משקל נוכחי</label><input id="f-wc" type="number" step="0.1" value="${p.weightCurrent||''}"></div>
        <div class="field"><label>משקל יעד</label><input id="f-wt" type="number" step="0.1" value="${p.weightTarget||''}"></div>
      </div>
      <div class="field"><label>מטרה</label>
        <div class="chips" id="f-goal">${goalsArr.map(([v,l])=>`<button class="chip ${p.goal===v?'on':''}" data-act="pick" data-group="f-goal" data-val="${v}">${l}</button>`).join('')}</div>
      </div>
    </div>

    <div class="card">
      <h3>🎯 יעדים יומיים</h3>
      <div class="row2">
        <div class="field"><label>קלוריות</label><input id="f-cal" type="number" value="${p.calorieTarget||''}"></div>
        <div class="field"><label>חלבון (ג')</label><input id="f-prot" type="number" value="${p.proteinTarget||''}"></div>
        <div class="field"><label>פחמימה (ג')</label><input id="f-carb" type="number" value="${p.carbTarget||''}"></div>
        <div class="field"><label>שומן (ג')</label><input id="f-fat" type="number" value="${p.fatTarget||''}"></div>
      </div>
      <div class="field"><label>מים (ליטר)</label><input id="f-water" type="number" step="0.1" value="${p.waterTarget||''}"></div>
      <div class="field"><label>שריפת אימון מתווספת לתקציב?</label>
        <div class="chips" id="f-budget">
          <button class="chip ${!p.addExerciseToBudget?'on':''}" data-act="pick" data-group="f-budget" data-val="0">לא (מומלץ)</button>
          <button class="chip ${p.addExerciseToBudget?'on':''}" data-act="pick" data-group="f-budget" data-val="1">כן</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>📖 תפריט מתוכנן (אופציונלי)</h3>
      ${['breakfast','lunch','dinner','snack'].map(k=>`<div class="field"><label>${mn[k]}</label><input id="m-${k}" value="${esc(getMenu(k))}" placeholder="מה מתוכנן ל${mn[k]}"></div>`).join('')}
    </div>

    <div class="card">
      <h3>📝 הערות + קשר</h3>
      <div class="field"><label>הערות אישיות (אלרגיות, העדפות)</label><textarea id="f-notes">${esc(p.notes||'')}</textarea></div>
      <div class="field"><label>וואטסאפ של גיא (לדוח שבועי)</label><input id="f-gia" value="${esc(p.giaWhats||'')}" placeholder="לדוגמה 972501234567" inputmode="tel"></div>
    </div>

    <div class="card">
      <h3>🔐 קוד מאמן</h3>
      <div class="field"><label>שנה את קוד הכניסה של המאמן</label><input id="f-code" value="${esc(p.coachCode||'1234')}"></div>
      <div class="hint">הקוד מגן על היעדים מפני שינוי בטעות. שתף אותו רק עם מי שמוסמך.</div>
    </div>

    <button class="btn" data-act="save-profile" style="margin:0 14px">✓ שמור שינויים</button>
    <div class="card" style="margin-top:14px">
      <button class="btn ghost" data-act="export" style="margin-bottom:10px">💾 גיבוי</button>
      <button class="btn danger" data-act="reset">🗑 איפוס כל הנתונים</button>
    </div>
    <div class="foot-note">Let's Go BUX 🦌</div>
  `;
}
function saveProfileEdits(){
  const p=getProfile()||{};
  const g=(id)=> (document.getElementById(id)||{}).value;
  const goalPick=document.querySelector('#f-goal .chip.on');
  const budgetPick=document.querySelector('#f-budget .chip.on');
  const menu=[];
  ['breakfast','lunch','dinner','snack'].forEach(k=>{ const v=g('m-'+k); if(v&&v.trim()) menu.push({meal:k,description:v.trim()}); });
  const np={ ...p,
    name:g('f-name')||p.name, age:+g('f-age')||p.age, height:+g('f-height')||p.height, sex:g('f-sex'),
    weightStart:+g('f-ws')||p.weightStart, weightCurrent:+g('f-wc')||p.weightCurrent, weightTarget:+g('f-wt')||p.weightTarget,
    goal: goalPick?goalPick.dataset.val:p.goal,
    calorieTarget:+g('f-cal')||0, proteinTarget:+g('f-prot')||0, carbTarget:+g('f-carb')||0, fatTarget:+g('f-fat')||0,
    waterTarget:+g('f-water')||2.5, addExerciseToBudget: budgetPick?budgetPick.dataset.val==='1':!!p.addExerciseToBudget,
    menuPlan:menu, notes:g('f-notes')||'', giaWhats:g('f-gia')||'', coachCode:g('f-code')||'1234',
  };
  saveProfile(np); toast('נשמר! 🦌'); renderProfile();
}

/* ===================== אונבורדינג ===================== */
function renderOnboarding(){
  const sexes=[['male','גבר'],['female','אישה']];
  const goalsArr=[['fat_loss','ירידה בשומן'],['muscle','עליה במסה'],['maintain','שמירה'],['performance','ביצועים']];
  const mn={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  document.getElementById('onboarding-body').innerHTML=`
    <div class="hello" style="text-align:center"><h1>ברוך הבא ל-<span>BUX Fuel</span> 🦌</h1>
      <div class="sub">הדלק שלך מתחיל כאן. בוא נגדיר את הפרופיל.</div></div>

    <div class="card">
      <h3>👤 פרטים אישיים</h3>
      <div class="field"><label>איך קוראים לך?</label><input id="o-name" placeholder="השם שלך"></div>
      <div class="row3">
        <div class="field"><label>גיל</label><input id="o-age" type="number" inputmode="numeric"></div>
        <div class="field"><label>גובה (ס"מ)</label><input id="o-height" type="number" inputmode="numeric"></div>
        <div class="field"><label>מין</label><select id="o-sex">${sexes.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
    </div>

    <div class="card">
      <h3>⚖️ משקל</h3>
      <div class="row3">
        <div class="field"><label>התחלה</label><input id="o-ws" type="number" step="0.1" inputmode="decimal"></div>
        <div class="field"><label>נוכחי</label><input id="o-wc" type="number" step="0.1" inputmode="decimal"></div>
        <div class="field"><label>יעד</label><input id="o-wt" type="number" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="field"><label>המטרה שלך</label>
        <div class="chips" id="o-goal">${goalsArr.map(([v,l],i)=>`<button class="chip ${i===0?'on':''}" data-act="pick" data-group="o-goal" data-val="${v}">${l}</button>`).join('')}</div>
      </div>
    </div>

    <div class="card">
      <h3>🎯 היעדים מגיא</h3>
      <div class="readonly-note">את המספרים האלה גיא נותנת לך. אם אתה לא יודע — אפשר להשאיר ריק וגיא תעדכן בכניסת מאמן.</div>
      <div class="row2">
        <div class="field"><label>קלוריות ליום</label><input id="o-cal" type="number" inputmode="numeric" placeholder="2000"></div>
        <div class="field"><label>חלבון (ג')</label><input id="o-prot" type="number" inputmode="numeric" placeholder="130"></div>
        <div class="field"><label>פחמימה (ג')</label><input id="o-carb" type="number" inputmode="numeric" placeholder="200"></div>
        <div class="field"><label>שומן (ג')</label><input id="o-fat" type="number" inputmode="numeric" placeholder="60"></div>
      </div>
      <div class="field"><label>מים (ליטר)</label><input id="o-water" type="number" step="0.1" placeholder="2.5"></div>
    </div>

    <div class="card">
      <h3>📖 התפריט מגיא (אופציונלי)</h3>
      ${['breakfast','lunch','dinner','snack'].map(k=>`<div class="field"><label>${mn[k]}</label><input id="o-m-${k}" placeholder="מה מתוכנן ל${mn[k]}"></div>`).join('')}
      <div class="field"><label>הערות מגיא (אלרגיות, העדפות)</label><textarea id="o-notes" placeholder="למשל: רגישות ללקטוז, לא אוהב דגים..."></textarea></div>
    </div>

    <div class="card">
      <h3>🏋️ שאלה אחרונה</h3>
      <div class="field"><label>שריפת קלוריות מאימון מתווספת לתקציב היומי?</label>
        <div class="chips" id="o-budget">
          <button class="chip on" data-act="pick" data-group="o-budget" data-val="0">לא (מומלץ)</button>
          <button class="chip" data-act="pick" data-group="o-budget" data-val="1">כן</button>
        </div>
        <div class="hint">ברירת המחדל היא "לא" — הגישה התזונתית המקובלת, מונעת אכילת יתר. השריפה עדיין מוצגת לידיעה.</div>
      </div>
    </div>

    <button class="btn" data-act="finish-onboarding" style="margin:0 14px 8px">בוא נתחיל 🦌</button>
    <div class="foot-note">Building a healthy community · CrossFit BUX Yehud</div>
  `;
}
function finishOnboarding(){
  const g=(id)=>(document.getElementById(id)||{}).value;
  const name=(g('o-name')||'').trim();
  if(!name){ toast('רק תכתוב לי איך קוראים לך 🙂'); document.getElementById('o-name').focus(); return; }
  const goalPick=document.querySelector('#o-goal .chip.on');
  const budgetPick=document.querySelector('#o-budget .chip.on');
  const menu=[];
  ['breakfast','lunch','dinner','snack'].forEach(k=>{ const v=g('o-m-'+k); if(v&&v.trim()) menu.push({meal:k,description:v.trim()}); });
  const wc=+g('o-wc')||+g('o-ws')||0;
  const p={
    name, age:+g('o-age')||null, sex:g('o-sex')||'male', height:+g('o-height')||null,
    weightStart:+g('o-ws')||wc||null, weightCurrent:wc||null, weightTarget:+g('o-wt')||null,
    goal: goalPick?goalPick.dataset.val:'fat_loss',
    calorieTarget:+g('o-cal')||2000, proteinTarget:+g('o-prot')||130, carbTarget:+g('o-carb')||200,
    fatTarget:+g('o-fat')||60, waterTarget:+g('o-water')||2.5,
    menuPlan:menu, notes:(g('o-notes')||'').trim(),
    addExerciseToBudget: budgetPick?budgetPick.dataset.val==='1':false,
    coachCode:'1234',
  };
  saveProfile(p);
  pushProfile(p);
  if(p.weightStart) store.set(KEYS.weights,[{date:todayKey(),weight:p.weightStart}]);
  store.set(KEYS.streak,{current:0,longest:0,lastLogDate:null});
  showModal(`<img class="badge" src="./logos/logo-badge-green.png" alt="BUX">
    <h2>הכל מוכן, ${esc(name)}! 🦌</h2>
    <p>הפרופיל שלך נשמר. עכשיו פשוט רשום מה אכלת ואיך התאמנת — ואני אדאג לשאר.</p>
    <button class="btn" data-act="close-modal">קדימה לדשבורד 💪</button>`);
  nav('home');
}

/* ===================== רצף ===================== */
function bumpStreak(){
  const st=store.get(KEYS.streak,{current:0,longest:0,lastLogDate:null});
  const today=todayKey();
  if(st.lastLogDate===today) return;
  const y=new Date(); y.setDate(y.getDate()-1);
  st.current = (st.lastLogDate===todayKey(y)) ? (st.current||0)+1 : 1;
  st.longest=Math.max(st.longest||0,st.current);
  st.lastLogDate=today;
  store.set(KEYS.streak,st);
}

/* ===================== מים ===================== */
function waterAdd(ml){ const log=todayLog(); log.water=clamp((log.water||0)+ml,0,6000); saveLog(todayKey(),log); renderHome(); }
function waterSet(i){ const p=getProfile(); const per=(+p.waterTarget||2.5)*1000/8; const log=todayLog();
  const target=Math.round((i+1)*per); log.water = (log.water>=target-1)? Math.round(i*per): target; saveLog(todayKey(),log); renderHome(); }

/* ===================== מאמן: קוד ===================== */
function askCoachCode(){
  if(isCoach()){ setCoach(false); toast('יצאת ממצב מאמן'); nav(USER?'home':'login'); return; }
  showModal(`<h2>🧠 כניסת מאמן</h2>
    <p>הזן את קוד המאמן כדי לראות ולנהל את כל המתאמנים.</p>
    <input id="pin-input" class="pin" maxlength="14" type="password" placeholder="קוד מאמן" autocomplete="off" style="letter-spacing:6px;font-size:22px">
    <button class="btn" data-act="check-pin" style="margin-top:18px">כניסה</button>
    <button class="btn ghost" data-act="close-modal" style="margin-top:8px">ביטול</button>`);
  setTimeout(()=>document.getElementById('pin-input')?.focus(),100);
}
function checkPin(){
  const val=(document.getElementById('pin-input')||{}).value||'';
  if(val===CLOUD.pin){ setCoach(true); closeModal(); toast('ברוך הבא, מאמן 🦌'); nav('dashboard'); }
  else { toast('קוד שגוי'); const e=document.getElementById('pin-input'); if(e){ e.value=''; e.focus(); } }
}

/* ===================== התחברות מתאמן ===================== */
function genId(){ return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7); }
function renderLogin(){
  document.getElementById('login-body').innerHTML=`
    <div class="hello" style="text-align:center"><h1>ברוך הבא ל-<span>BUX Fuel</span> 🦌</h1>
      <div class="sub">היומן התזונה של קרוספיט BUX</div></div>
    <div class="card">
      <h3>🏋️ כניסת מתאמנים</h3>
      <div class="field"><label>שם מלא</label><input id="auth-name" placeholder="שם פרטי + משפחה" autocomplete="off"></div>
      <div class="field"><label>קוד אישי</label><input id="auth-code" type="password" placeholder="קוד סודי משלך" autocomplete="off"></div>
      <div id="auth-msg" class="hint" style="color:var(--danger);min-height:18px"></div>
      <button class="btn" data-act="auth-go">כניסה / הרשמה</button>
      <div class="hint" style="margin-top:12px">פעם ראשונה? בחר <b>שם מלא</b> וקוד אישי — וניצור לך חשבון. בכניסות הבאות תתחבר עם אותם פרטים, מכל מכשיר. כל אחד רואה רק את עצמו.</div>
    </div>
    <div class="card tight" style="text-align:center">
      <button class="btn ghost sm" data-act="coach-login" style="margin:0 auto">🧠 כניסת מאמן (גיא)</button>
    </div>
    <div class="foot-note">Building a healthy community · CrossFit BUX Yehud 🦌</div>`;
  const c=document.getElementById('auth-code'); if(c) c.addEventListener('keydown',e=>{ if(e.key==='Enter') doAuth(); });
}
async function doAuth(){
  const name=(document.getElementById('auth-name').value||'').trim();
  const code=document.getElementById('auth-code').value||'';
  const msg=document.getElementById('auth-msg');
  if(name.length<2){ msg.textContent='נא להזין שם.'; return; }
  if(code.length<3){ msg.textContent='בחר קוד של 3 תווים לפחות.'; return; }
  msg.style.color='var(--muted)'; msg.textContent='בודק…';
  const users=await cloudFetchUsers(); const norm=s=>(s||'').trim().toLowerCase();
  const ex=users.find(u=>norm(u.name)===norm(name)); const h=await sha(code);
  if(ex){
    if(ex.codeHash===h){ setUser({uid:ex.uid,name:ex.name,codeHash:h}); msg.textContent=''; await afterLogin(); }
    else { msg.style.color='var(--danger)'; msg.textContent='הקוד לא תואם לשם הזה 🔒'; }
  } else {
    const uid=genId(); await cloudPut('users/'+uid,{name,codeHash:h,createdAt:Date.now()});
    setUser({uid,name,codeHash:h}); msg.textContent=''; await afterLogin();
  }
}

/* ===================== דשבורד מאמן ===================== */
let DASH_USERS=[];
const GOAL_HE={fat_loss:'ירידה בשומן',muscle:'עליה במסה',maintain:'שמירה',performance:'ביצועים'};
async function renderDashboard(){
  const body=document.getElementById('dashboard-body');
  body.innerHTML=`<div class="hello"><h1>דשבורד מאמן 🧠</h1><div class="sub">טוען מתאמנים...</div></div>
    <div class="loading"><div class="spinner"></div></div>`;
  DASH_USERS=(await cloudFetchUsers()).filter(u=>u.name);
  DASH_USERS.sort((a,b)=>(a.name||'').localeCompare(b.name||'','he'));
  const cards=DASH_USERS.map(u=>{
    const p=u.profile||{}; const log=(u.logs&&u.logs[todayKey()])||blankLog(); const t=totals(log);
    const cal=+p.calorieTarget||0; const pct=cal?clamp(t.kcal/cal,0,1):0;
    const protPct=p.proteinTarget?clamp(t.protein/p.proteinTarget,0,1):0;
    const dot=t.kcal===0?'#274d33':((pct>=0.8&&pct<=1.1&&protPct>=0.85)?'var(--yellow)':'#6b7c3a');
    return `<div class="card tight" data-act="dash-open" data-uid="${u.uid}" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <span style="width:13px;height:13px;border-radius:50%;background:${dot};flex:none"></span>
        <div style="flex:1;text-align:right"><div class="li-main" style="font-size:17px">${esc(u.name)}</div>
          <div class="li-sub">${p.goal?GOAL_HE[p.goal]:'טרם הוגדרו יעדים'}</div></div>
        <div style="text-align:left"><div style="font-weight:900;color:var(--yellow);font-size:18px">${R(t.kcal)}<span style="font-size:11px;color:var(--muted)">/${cal||'—'}</span></div>
          <div class="li-sub">חלבון ${R(t.protein)}/${p.proteinTarget||'—'}</div></div>
      </div></div>`;
  }).join('');
  body.innerHTML=`<div class="hello"><h1>דשבורד מאמן 🧠</h1><div class="sub">${DASH_USERS.length} מתאמנים · ${heDate()}</div></div>
    <div style="padding:0 14px">${cards||'<div class="empty">עדיין אין מתאמנים רשומים</div>'}</div>
    <div class="card tight" style="margin-top:14px"><button class="btn ghost" data-act="coach-exit">יציאה ממצב מאמן</button></div>
    <div class="foot-note">🟡 עומד ביעד · 🟢 חלקי · ⚫ טרם רשם היום<br>לחיצה על מתאמן — צפייה ועריכת יעדים 🦌</div>`;
}
function renderParticipant(uid){
  const u=DASH_USERS.find(x=>x.uid===uid); if(!u){ nav('dashboard'); return; }
  const p=u.profile||{}; const log=(u.logs&&u.logs[todayKey()])||blankLog(); const t=totals(log);
  const goalsArr=[['fat_loss','ירידה בשומן'],['muscle','עליה במסה'],['maintain','שמירה'],['performance','ביצועים']];
  const mn={breakfast:'בוקר',lunch:'צהריים',dinner:'ערב',snack:'ביניים'};
  const menu=p.menuPlan||[]; const gm=k=>(menu.find(m=>m.meal===k)||{}).description||'';
  document.getElementById('dashboard-body').innerHTML=`
    <div class="subhead"><button class="back" data-act="dash-back">→</button><h2>${esc(u.name)}</h2></div>
    <div class="card">
      <h3>📊 היום</h3>
      <div class="macros" style="grid-template-columns:repeat(2,1fr)">
        <div class="macro protein"><div class="mlabel">קלוריות</div><div class="mval">${R(t.kcal)}<span style="font-size:12px">/${p.calorieTarget||'—'}</span></div></div>
        <div class="macro"><div class="mlabel">חלבון</div><div class="mval">${R(t.protein)}<span style="font-size:12px">/${p.proteinTarget||'—'}</span></div></div>
      </div>
      <div style="text-align:center;color:var(--muted);font-weight:700;margin-top:10px">⚖️ ${p.weightCurrent||'—'} ק"ג (יעד ${p.weightTarget||'—'}) · 🔥 ${R(t.burn)} קל'</div>
      ${(log.meals||[]).length?'<div class="section-title" style="margin:14px 0 4px">ארוחות היום</div>'+log.meals.map(m=>`<div class="list-item"><div class="li-main" style="font-size:14px">${esc(m.description||'')}</div><div class="li-k">${R(m.kcal)}</div></div>`).join(''):'<div class="empty" style="padding:10px">עוד לא רשם היום</div>'}
    </div>
    <div class="card">
      <h3>🎯 עריכת יעדים</h3>
      <div class="row2">
        <div class="field"><label>קלוריות</label><input id="d-cal" type="number" value="${p.calorieTarget||''}"></div>
        <div class="field"><label>חלבון (ג')</label><input id="d-prot" type="number" value="${p.proteinTarget||''}"></div>
        <div class="field"><label>פחמימה (ג')</label><input id="d-carb" type="number" value="${p.carbTarget||''}"></div>
        <div class="field"><label>שומן (ג')</label><input id="d-fat" type="number" value="${p.fatTarget||''}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>מים (ליטר)</label><input id="d-water" type="number" step="0.1" value="${p.waterTarget||''}"></div>
        <div class="field"><label>משקל יעד</label><input id="d-wt" type="number" step="0.1" value="${p.weightTarget||''}"></div>
      </div>
      <div class="field"><label>מטרה</label><div class="chips" id="d-goal">${goalsArr.map(([v,l])=>`<button class="chip ${p.goal===v?'on':''}" data-act="pick" data-group="d-goal" data-val="${v}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="card">
      <h3>📖 תפריט + הערות</h3>
      ${['breakfast','lunch','dinner','snack'].map(k=>`<div class="field"><label>${mn[k]}</label><input id="d-m-${k}" value="${esc(gm(k))}" placeholder="${mn[k]}"></div>`).join('')}
      <div class="field"><label>הערות אישיות</label><textarea id="d-notes">${esc(p.notes||'')}</textarea></div>
    </div>
    <button class="btn" data-act="dash-save" data-uid="${uid}" style="margin:0 14px">✓ שמור למתאמן</button>
    <div class="card" style="margin-top:14px"><button class="btn danger" data-act="dash-del" data-uid="${uid}">🗑 מחק מתאמן</button></div>
    <div class="foot-note">Let's Go BUX 🦌</div>`;
}
async function saveParticipant(uid){
  const u=DASH_USERS.find(x=>x.uid===uid); if(!u) return;
  const g=id=>(document.getElementById(id)||{}).value;
  const goalPick=document.querySelector('#d-goal .chip.on');
  const menu=[]; ['breakfast','lunch','dinner','snack'].forEach(k=>{ const v=g('d-m-'+k); if(v&&v.trim()) menu.push({meal:k,description:v.trim()}); });
  // עדכון חלקי — רק השדות שגיא עורכת, בלי לדרוס משקל/פרטים אישיים של המתאמן
  const fields={
    calorieTarget:+g('d-cal')||0, proteinTarget:+g('d-prot')||0, carbTarget:+g('d-carb')||0, fatTarget:+g('d-fat')||0,
    waterTarget:+g('d-water')||2.5, weightTarget:+g('d-wt')||null,
    goal: goalPick?goalPick.dataset.val:((u.profile||{}).goal||'fat_loss'), menuPlan:menu, notes:g('d-notes')||'' };
  if(!u.profile) fields.name=u.name; // אם המתאמן עוד לא עבר אונבורדינג
  const ok=await cloudPatch('users/'+uid+'/profile', fields); u.profile={...(u.profile||{}), ...fields};
  toast(ok?'נשמר למתאמן 🦌':'שמירה נכשלה');
}
async function delParticipant(uid){
  await cloudPut('users/'+uid, null);
  DASH_USERS=DASH_USERS.filter(x=>x.uid!==uid);
  closeModal(); toast('המתאמן נמחק'); nav('dashboard');
}

/* ===================== גיבוי / איפוס ===================== */
function exportData(){
  const data={}; Object.values(KEYS).forEach(k=> data[k]=store.get(k,null));
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='bux-fuel-backup-'+todayKey()+'.json'; a.click();
  toast('הגיבוי ירד למכשיר 💾');
}
function resetAll(){
  showModal(`<h2>למחוק הכל?</h2><p>פעולה זו תמחק את הפרופיל וכל הנתונים מהמכשיר. אין חזרה.</p>
    <button class="btn danger" data-act="reset-confirm">כן, מחק הכל</button>
    <button class="btn ghost" data-act="close-modal" style="margin-top:8px">ביטול</button>`);
}

/* ===================== חלון קופץ / טוסט ===================== */
let toastT;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2400); }
function showModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('overlay').classList.add('show'); }
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }

/* ===================== עזר ===================== */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===================== מפיץ אירועים ===================== */
document.addEventListener('click',e=>{
  const nv=e.target.closest('[data-nav]'); if(nv){ nav(nv.dataset.nav); return; }
  const a=e.target.closest('[data-act]'); if(!a) return;
  const act=a.dataset.act;
  switch(act){
    case 'water-add': waterAdd(+a.dataset.ml); break;
    case 'water-set': waterSet(+a.dataset.i); break;
    case 'meal-type': currentMealType=a.dataset.val; document.querySelectorAll('#meal-types .chip').forEach(c=>c.classList.toggle('on',c===a)); break;
    case 'load-menu': { const p=getProfile(); const m=(p.menuPlan||[]).find(x=>x.meal===currentMealType)||(p.menuPlan||[])[0];
      if(m){ document.getElementById('meal-text').value=m.description; toast('נטען מהתפריט'); } else toast('אין תפריט מתאים'); break; }
    case 'meal-mode': mealMode=a.dataset.val; buildMealUI(); break;
    case 'food-quick': { const s=document.getElementById('food-search'); if(s){ s.value=a.dataset.val; renderFoodResults(s.value); s.focus(); } break; }
    case 'food-pick': openPortion(a.dataset.i); break;
    case 'portion-add': portionAdd(); break;
    case 'ft-add': ftAdd(); break;
    case 'item-del': mealItems.splice(+a.dataset.i,1); buildMealUI(); break;
    case 'meal-load': loadMeal(a.dataset.sig); break;
    case 'meal-forget': forgetMeal(a.dataset.sig); break;
    case 'analyze-meal': doAnalyzeMeal(); break;
    case 'save-meal': saveMealCart(); break;
    case 'fill-act': document.getElementById('act-text').value=a.dataset.val; break;
    case 'analyze-act': doAnalyzeAct(); break;
    case 'save-act': saveAct(); break;
    case 'chat-send': sendChat(); break;
    case 'chat-sugg': sendChat(a.dataset.val); break;
    case 'weigh-in': { const v=+document.getElementById('weigh-in').value; if(!v){ toast('הזן משקל'); break; }
      const p=getProfile(); p.weightCurrent=v; saveProfile(p); pushProfile({weightCurrent:v});
      const w=store.get(KEYS.weights,[]); w.push({date:todayKey(),weight:v}); store.set(KEYS.weights,w);
      toast('המשקל נשמר ⚖️'); renderProgress(); break; }
    case 'weekly-report': weeklyReport(); break;
    case 'pick': { document.querySelectorAll('#'+a.dataset.group+' .chip').forEach(c=>c.classList.remove('on')); a.classList.add('on'); break; }
    case 'finish-onboarding': finishOnboarding(); break;
    case 'save-profile': saveProfileEdits(); break;
    case 'coach-logout': setCoach(false); toast('יצאת ממצב מאמן'); renderProfile(); break;
    case 'export': exportData(); break;
    case 'reset': resetAll(); break;
    case 'reset-confirm': Object.values(KEYS).forEach(k=>localStorage.removeItem(k)); setCoach(false); closeModal(); location.reload(); break;
    case 'check-pin': checkPin(); break;
    case 'close-modal': closeModal(); break;
    case 'auth-go': doAuth(); break;
    case 'coach-login': askCoachCode(); break;
    case 'coach-exit': setCoach(false); toast('יצאת ממצב מאמן'); nav(USER?'home':'login'); break;
    case 'logout': logout(); break;
    case 'dash-open': renderParticipant(a.dataset.uid); window.scrollTo(0,0); break;
    case 'dash-back': nav('dashboard'); break;
    case 'dash-save': saveParticipant(a.dataset.uid); break;
    case 'dash-del': showModal(`<h2>למחוק את ${esc((DASH_USERS.find(x=>x.uid===a.dataset.uid)||{}).name||'')}?</h2><p>כל הנתונים של המתאמן יימחקו מהענן. אין חזרה.</p><button class="btn danger" data-act="dash-del-yes" data-uid="${a.dataset.uid}">כן, מחק</button><button class="btn ghost" data-act="close-modal" style="margin-top:8px">ביטול</button>`); break;
    case 'dash-del-yes': delParticipant(a.dataset.uid); break;
    case 'del-meal': { const log=todayLog(); log.meals.splice(+a.dataset.i,1); saveLog(todayKey(),log); renderHome(); break; }
    case 'del-act': { const log=todayLog(); log.activities.splice(+a.dataset.i,1); saveLog(todayKey(),log); renderHome(); break; }
  }
});
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });
document.getElementById('home-lock').addEventListener('click',askCoachCode);
document.getElementById('profile-lock').addEventListener('click',askCoachCode);
document.getElementById('dash-exit').addEventListener('click',()=>{ setCoach(false); toast('יצאת ממצב מאמן'); nav(USER?'home':'login'); });

/* ===================== אתחול ===================== */
async function boot(){
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
  if(cloudOn() && !USER){ nav('login'); return; }
  await afterLogin();
}
async function afterLogin(){
  if(cloudOn() && USER){ await pullUser(USER.uid); }
  if(getProfile()) nav('home'); else nav('onboarding');
}
boot();
