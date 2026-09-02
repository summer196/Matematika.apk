/* ============================================================
   APP.JS — logic app buat bidadari (index.html)
   Sekarang dengan sidebar navigasi, Riwayat Soal, dan Topscore.
   Butuh supabase-js CDN + supabase-config.js dimuat sebelum ini.
   ============================================================ */

/* ---------------- Supabase ---------------- */
let sb = null;
try{
  if(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL.indexOf('GANTI-DENGAN') === -1){
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}catch(e){ console.warn('Supabase belum dikonfigurasi, pakai soal otomatis aja.', e); }

/* ---------------- Storage keys ---------------- */
const STORAGE_KEY = 'kebunAngka_totalStars';
const HISTORY_KEY = 'kebunAngka_history';
const STAR_DATE_KEY = 'kebunAngka_starDate';
const USERNAME_KEY = 'kebunAngka_username';

/* ---------------- Pengaturan tampilan (diatur admin, berlaku global) ---------------- */
let timerDisplayEnabled = true; // default nyala selama belum kebaca dari server

async function fetchAppSettings(){
  if(!sb) return;
  try{
    const { data, error } = await sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if(error){ console.warn('Gagal ambil pengaturan tampilan:', error.message); return; }
    if(data) timerDisplayEnabled = data.timer_enabled !== false;
  }catch(e){ console.warn('Gagal ambil pengaturan tampilan:', e); }
}

let totalStars = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
let username = localStorage.getItem(USERNAME_KEY) || '';

function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function dayNameID(dateStr){
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const d = new Date(dateStr + 'T00:00:00');
  return days[d.getDay()];
}
function logDailyStars(dateStr, count, type){
  if(!sb || count <= 0) return;
  sb.from('daily_star_log').insert([{
    log_date: dateStr,
    day_name: dayNameID(dateStr),
    star_count: count,
    reset_type: type,
    username: username || null
  }]).then(()=>{}, (err) => console.warn('Gagal simpan log bintang harian:', err));
  updateStarRecordIfHigher(count, dateStr);
}

async function updateStarRecordIfHigher(count, dateStr){
  if(!sb || count <= 0 || !username) return;
  try{
    const { data, error } = await sb.from('star_record').select('*').eq('username', username).maybeSingle();
    if(error) return;
    if(!data || count > data.best_star_count){
      await sb.from('star_record').upsert([{
        username,
        best_star_count: count,
        best_date: dateStr,
        best_day_name: dayNameID(dateStr),
        updated_at: new Date().toISOString()
      }], { onConflict: 'username' });
    }
  }catch(e){ console.warn('Gagal update rekor bintang:', e); }
}

async function fetchStarRecord(){
  if(!sb || !username) return null;
  try{
    const { data, error } = await sb.from('star_record').select('*').eq('username', username).maybeSingle();
    if(error) return null;
    return data;
  }catch(e){ return null; }
}
let cachedStarRecord = null;
function formatSqlDateClient(dateStr){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
}

/* ---------------- Sync progress ke server (biar bisa direstore per username) ---------------- */
async function syncProgressFromServer(){
  if(!sb || !username) return;
  try{
    const { data, error } = await sb.from('user_progress').select('*').eq('username', username).maybeSingle();
    if(error || !data) return;
    totalStars = data.total_stars || 0;
    localStorage.setItem(STORAGE_KEY, String(totalStars));
    if(data.star_date) localStorage.setItem(STAR_DATE_KEY, data.star_date);
  }catch(e){ console.warn('Gagal restore progress dari server:', e); }
}
function pushProgressToServer(){
  if(!sb || !username) return;
  sb.from('user_progress').upsert([{
    username, total_stars: totalStars, star_date: todayStr(), updated_at: new Date().toISOString()
  }], { onConflict: 'username' }).then(()=>{}, (err) => console.warn('Gagal simpan progress ke server:', err));
}

/* Cek apakah udah ganti hari sejak terakhir buka app — kalau iya, catat total
   bintang hari sebelumnya (reset otomatis) terus reset ke 0 buat hari baru. */
function performDailyResetCheck(){
  const storedDate = localStorage.getItem(STAR_DATE_KEY);
  const today = todayStr();
  if(storedDate && storedDate !== today){
    logDailyStars(storedDate, totalStars, 'otomatis');
    totalStars = 0;
    localStorage.setItem(STORAGE_KEY, '0');
  }
  localStorage.setItem(STAR_DATE_KEY, today);
}

// Jaga-jaga kalau app dibiarin kebuka lewat tengah malam tanpa di-refresh
setInterval(() => {
  const storedDate = localStorage.getItem(STAR_DATE_KEY);
  if(storedDate && storedDate !== todayStr()){
    performDailyResetCheck();
    pushProgressToServer();
    if(state.screen !== 'quiz') render();
  }
}, 60000);

let cachedServerHistory = null;
async function fetchServerHistory(){
  if(!sb || !username) return null;
  try{
    const { data, error } = await sb.from('round_history').select('*').eq('username', username).order('played_at', {ascending:false}).limit(200);
    if(error) return null;
    return data.map(r => ({ date: r.played_at, op: r.operation, score: r.score, total: r.total, timeMs: r.time_ms }));
  }catch(e){ return null; }
}
function loadHistory(){
  if(cachedServerHistory) return cachedServerHistory;
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveHistoryEntry(op, score, timeMs){
  const raw = localStorage.getItem(HISTORY_KEY);
  let history = [];
  try{ history = JSON.parse(raw || '[]'); }catch(e){}
  history.unshift({ date: new Date().toISOString(), op, score, total: 10, timeMs: timeMs || null });
  // Simpan maksimal 200 entri biar gak numpuk terus (fallback offline doang)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0,200)));
  if(sb && username){
    sb.from('round_history').insert([{
      username, operation: op, score, total: 10, time_ms: timeMs || null
    }]).then(()=>{}, (err) => console.warn('Gagal simpan riwayat ke server:', err));
  }
  cachedServerHistory = null; // biar layar Riwayat/Topscore fetch ulang data terbaru
}
function formatDate(iso){
  const d = new Date(iso);
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

/* ---------------- Kosakata Inggris (tab Bahasa Inggris) ---------------- */
let vocabList = null;       // null = belum pernah dimuat
let vocabCategories = [];
let vocabLoading = false;
let currentVocabWord = null;
let vocabFilter = { level: 'all', category: 'all' };

async function fetchVocabList(){
  if(!sb) return [];
  try{
    const { data, error } = await sb.from('vocabulary').select('*').eq('is_active', true);
    if(error){ console.warn('Gagal ambil kosakata:', error.message); return []; }
    return data || [];
  }catch(e){ console.warn('Gagal ambil kosakata:', e); return []; }
}

function filteredVocabList(){
  return (vocabList || []).filter(v =>
    (vocabFilter.level === 'all' || v.level === vocabFilter.level) &&
    (vocabFilter.category === 'all' || v.category === vocabFilter.category)
  );
}

function pickRandomVocab(){
  const pool = filteredVocabList();
  if(pool.length === 0){ currentVocabWord = null; return; }
  let next;
  do{
    next = pool[Math.floor(Math.random()*pool.length)];
  } while(pool.length > 1 && currentVocabWord && next.id === currentVocabWord.id);
  currentVocabWord = next;
}

function speakVocabWord(){
  if(!currentVocabWord || !('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(currentVocabWord.word);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/* ---------------- Latihan Terjemahan (MCQ dua arah) ---------------- */
let translationItems = null;   // null = belum dimuat
let translationLoading = false;
let translationDirection = 'campur'; // id_en | en_id | campur
let currentTranslationQ = null; // { sourceText, options:[...], correctText, dir }
let translationAnswered = false;
let translationSelected = null;
let translationScore = { correct: 0, total: 0 };

async function fetchTranslationItems(){
  if(!sb) return [];
  try{
    const { data, error } = await sb.from('translation_items').select('*').eq('is_active', true);
    if(error){ console.warn('Gagal ambil soal terjemahan:', error.message); return []; }
    return data || [];
  }catch(e){ console.warn('Gagal ambil soal terjemahan:', e); return []; }
}

function generateTranslationQuestion(){
  const pool = translationItems || [];
  if(pool.length < 4){ currentTranslationQ = null; return; }

  let dir = translationDirection;
  if(dir === 'campur') dir = Math.random() < 0.5 ? 'id_en' : 'en_id';

  const target = pool[Math.floor(Math.random()*pool.length)];
  const sourceText = dir === 'id_en' ? target.text_id : target.text_en;
  const correctText = dir === 'id_en' ? target.text_en : target.text_id;

  const others = pool.filter(x => x.id !== target.id);
  const distractors = shuffle(others).slice(0,3).map(x => dir === 'id_en' ? x.text_en : x.text_id);
  const options = shuffle([correctText, ...distractors]);

  currentTranslationQ = { sourceText, correctText, options, dir };
  translationAnswered = false;
  translationSelected = null;
}

/* ---------------- State ---------------- */
let state = {
  screen: username ? 'home' : 'welcome', // welcome | home | quiz | result | riwayat | topscore | kosakata
  chosenOp: null,
  questions: [],
  idx: 0,
  correctCount: 0,
  answered: false,
  slotResults: [],
  loading: false,
  sidebarOpen: false,
  timerInterval: null,
  roundAccumulatedMs: 0,
  lastQuestionTimeMs: 0
};

const OP_LABELS = {
  tambah: {label:'Tambah', symbol:'+'},
  kurang: {label:'Kurang', symbol:'−'},
  kali:   {label:'Kali',   symbol:'×'},
  bagi:   {label:'Bagi',   symbol:'÷'}
};
const ALL_OPS = ['tambah','kurang','kali','bagi','campur'];

const ENCOURAGE_RIGHT = ['Pinterrnyaa sayangggku', 'Betull banget sayangggg', 'Nice sayanggggg!!', 'Manteppp sayanggggg', 'Tepat sekalii sayanggggg!!'];
const ENCOURAGE_WRONG = ['Coba lagi yuk sayanggg', 'Dikit lagi bener sayanggg', 'Gapapa sayanggggg kita belajar lagi yaa', 'Pelan pelan aja sayanggggg'];

function rand(min, max){
  if(min > max){ const t=min; min=max; max=t; }
  return Math.floor(Math.random()*(max-min+1))+min;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
function genSessionId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
function formatDuration(ms){
  if(ms == null || isNaN(ms)) return '-';
  const totalSec = Math.round(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}d`;
}

/* ---------------- Pengaturan rentang angka (dari dashboard admin) ---------------- */
const DEFAULT_SETTINGS = {
  tambah: {r1min:1,  r1max:10, r2min:1,  r2max:10},
  kurang: {r1min:5,  r1max:20, r2min:1,  r2max:20},
  kali:   {r1min:2,  r1max:9,  r2min:2,  r2max:9},
  bagi:   {r1min:2,  r1max:9,  r2min:2,  r2max:9}
};
let questionSettings = null;

async function loadQuestionSettings(){
  if(questionSettings) return questionSettings;
  if(!sb){ questionSettings = DEFAULT_SETTINGS; return questionSettings; }
  try{
    const { data, error } = await sb.from('question_settings').select('*');
    if(error || !data || data.length === 0){ questionSettings = DEFAULT_SETTINGS; return questionSettings; }
    const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    data.forEach(row => {
      merged[row.operation] = { r1min:row.range1_min, r1max:row.range1_max, r2min:row.range2_min, r2max:row.range2_max };
    });
    questionSettings = merged;
  }catch(e){
    console.warn('Gagal ambil pengaturan rentang, pakai default.', e);
    questionSettings = DEFAULT_SETTINGS;
  }
  return questionSettings;
}

/* ---------------- Question generation (procedural) ---------------- */
function generateQuestion(op, settings){
  if(op === 'campur') op = pick(['tambah','kurang','kali','bagi']);
  const s = settings[op];
  let a,b,answer;
  if(op === 'tambah'){
    a=rand(s.r1min,s.r1max); b=rand(s.r2min,s.r2max); answer=a+b;
  } else if(op === 'kurang'){
    a=rand(s.r1min,s.r1max);
    const bMax = Math.min(s.r2max, a);
    const bMin = Math.min(s.r2min, bMax);
    b=rand(bMin,bMax); answer=a-b;
  } else if(op === 'kali'){
    a=rand(s.r1min,s.r1max); b=rand(s.r2min,s.r2max); answer=a*b;
  } else {
    const q=rand(s.r1min,s.r1max); b=rand(s.r2min,s.r2max); a=b*q; answer=q;
  }
  return { op, a, b, answer, isCustom:false };
}

/* ---------------- Question fetching (custom, from dashboard admin) ---------------- */
async function fetchCustomQuestions(chosenOp){
  if(!sb) return [];
  try{
    let query = sb.from('custom_questions').select('*').eq('is_active', true);
    if(chosenOp !== 'campur') query = query.eq('operation', chosenOp);
    const { data, error } = await query;
    if(error){ console.warn('Gagal ambil soal custom:', error.message); return []; }
    return (data || []).map(row => ({
      op: row.operation,
      isCustom: true,
      text: row.question_text,
      answer: Number(row.answer),
      note: row.note || ''
    }));
  }catch(e){
    console.warn('Gagal ambil soal custom:', e);
    return [];
  }
}

async function generateRound(chosenOp){
  const settings = await loadQuestionSettings();
  const custom = shuffle(await fetchCustomQuestions(chosenOp));
  if(custom.length >= 10) return custom.slice(0,10);
  let round = custom.slice();
  while(round.length < 10) round.push(generateQuestion(chosenOp, settings));
  return shuffle(round);
}

/* ---------------- Visual renderers ---------------- */
function iconRow(count, extraClass){
  let out = '';
  for(let i=0;i<count;i++) out += `<span class="ic ${extraClass||''}"></span>`;
  return out;
}

function renderVisual(q){
  if(q.isCustom){
    if(q.note) return `<div class="compact-visual">${escapeHtml(q.note)}</div>`;
    return `<div class="compact-visual">Soal tambahan dari admin.</div>`;
  }
  const {op,a,b} = q;
  if(op === 'tambah' || op === 'kurang'){
    return '';
  }
  if(op === 'kali'){
    const total = a*b;
    if(total <= 30){
      let groups = '';
      for(let i=0;i<b;i++) groups += `<div class="group-box">${iconRow(a)}</div>`;
      return `<div class="icon-groups">${groups}</div>`;
    }
    return `<div class="compact-visual"><span class="big">${b} kelompok</span>berisi ${a} buah di tiap kelompok</div>`;
  }
  if(op === 'bagi'){
    const dividend = a, groupsCount = b, perGroup = q.answer;
    if(dividend <= 30){
      let groups = '';
      for(let i=0;i<groupsCount;i++) groups += `<div class="group-box">${iconRow(perGroup)}</div>`;
      return `<div class="icon-groups">${groups}</div>`;
    }
    return `<div class="compact-visual"><span class="big">${dividend} buah</span>dibagi rata ke ${groupsCount} kelompok</div>`;
  }
  return '';
}

function questionText(q){
  if(q.isCustom) return q.text;
  const s = OP_LABELS[q.op].symbol;
  return `${q.a} ${s} ${q.b} = ?`;
}

/* ---------------- Render root ---------------- */
function render(){
  stopLiveTimer();
  const root = document.getElementById('root');
  root.innerHTML = sidebarHtml() + mainHtml();
  attachHandlers();
}

function startLiveTimer(){
  stopLiveTimer();
  state.timerInterval = setInterval(() => {
    if(state.answered) return; // jeda total, gak update apa-apa selama nunggu klik lanjut
    const qEl = document.getElementById('qTimer');
    const rEl = document.getElementById('roundTimer');
    const currentSegment = Date.now() - (state.questionStartTime || Date.now());
    if(qEl) qEl.textContent = formatDuration(currentSegment);
    if(rEl) rEl.textContent = formatDuration(state.roundAccumulatedMs + currentSegment);
  }, 1000);
}
function stopLiveTimer(){
  if(state.timerInterval){ clearInterval(state.timerInterval); state.timerInterval = null; }
}

/* ---------------- Sidebar ---------------- */
function sidebarHtml(){
  const navItem = (screen, label) => `
    <button class="nav-item ${state.screen === screen ? 'active':''}" data-nav="${screen}">
      <span>${label}</span>
    </button>`;

  return `
    <div class="sidebar-backdrop ${state.sidebarOpen ? 'show':''}" id="sidebarBackdrop"></div>
    <div class="sidebar ${state.sidebarOpen ? 'open':''}" id="sidebar">
      <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu"><span class="hamburger-lines"></span></button>
      <div class="sidebar-content">
        <div class="sidebar-title"><h1>Matematika</h1></div>
        <span class="sidebar-badge">Senyum Kenangan</span>
        <ul class="nav-list" style="list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:4px;">
          <li>${navItem('home','Beranda')}</li>
          <li>${navItem('kosakata','Bahasa Inggris')}</li>
          <li>${navItem('terjemahan','Latihan Terjemahan')}</li>
          <li>${navItem('riwayat','Riwayat Soal')}</li>
          <li>${navItem('topscore','Topscore')}</li>
          <li><a class="nav-item" href="admin.html"><span>Menu Admin</span></a></li>
        </ul>
        <div class="sidebar-footer">
          <img class="sidebar-mini-avatar" src="assets/senyum-kenangan.jpg" alt="Ichan dan Michell">
          <span class="sidebar-tagline">Semangat belajarnya, sayangku</span>
        </div>
      </div>
    </div>
  `;
}

function mainHtml(){
  let inner;
  if(state.screen === 'welcome') inner = welcomeScreen();
  else if(state.screen === 'home') inner = homeScreen();
  else if(state.screen === 'quiz') inner = quizScreen();
  else if(state.screen === 'result') inner = resultScreen();
  else if(state.screen === 'riwayat') inner = riwayatScreen();
  else if(state.screen === 'topscore') inner = topscoreScreen();
  else if(state.screen === 'kosakata') inner = kosakataScreen();
  else if(state.screen === 'terjemahan') inner = terjemahanScreen();
  return `<div class="app"><div class="app-inner">${inner}</div></div>`;
}

/* ---------------- Welcome (isi nama pertama kali) ---------------- */
function welcomeScreen(){
  return `
    <div class="card" style="text-align:center; margin-top:60px;">
      <h2 style="margin-bottom:6px;">Siapa nama kamu?</h2>
      <div class="subtitle" style="margin-bottom:18px;">Nama ini digunakan untuk menyimpan bintang dan riwayat jawaban kamu.</div>
      <input type="text" id="usernameInput" placeholder="Nama kamu" maxlength="40"
        style="width:100%; padding:14px; border-radius:16px; border:2px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff; font-size:18px; text-align:center; margin-bottom:14px;">
      <button class="start-btn" id="saveUsernameBtn">Mulai</button>
    </div>
  `;
}

/* ---------------- Home ---------------- */
function homeScreen(){
  return `
    <div class="brand"><h1>Matematika Dasar</h1><div class="stars">${totalStars} Bintang</div></div>
    <div class="subtitle">Selamat datang, ${escapeHtml(username || 'bidadari')}. <button id="changeNameBtn" style="background:none; border:none; color:var(--gold); font-weight:700; font-size:12px; cursor:pointer; text-decoration:underline; padding:0;">Ganti nama</button></div>
    <div class="card">
      <h2 style="font-size:18px;">Pilih Kategori</h2>
      <div class="op-grid">
        <button class="op-card" data-op="tambah"><span class="sym">+</span>Tambah</button>
        <button class="op-card" data-op="kurang"><span class="sym">−</span>Kurang</button>
        <button class="op-card" data-op="kali"><span class="sym">×</span>Kali</button>
        <button class="op-card" data-op="bagi"><span class="sym">÷</span>Bagi</button>
        <button class="op-card campur" data-op="campur">Campuran</button>
      </div>
      <button class="start-btn" id="startBtn" disabled>Mulai Latihan</button>
      <div class="hint" id="homeHint">Pilih salah satu kategori terlebih dahulu untuk memulai.</div>
    </div>
  `;
}

/* ---------------- Quiz ---------------- */
function quizScreen(){
  if(state.loading){
    return `
      <div class="brand"><h1 style="font-size:20px;">Matematika Dasar</h1><div class="stars">${totalStars} Bintang</div></div>
      <div class="card"><div class="loading-line">Menyiapkan soal, mohon tunggu.</div></div>
    `;
  }
  const q = state.questions[state.idx];
  const visual = renderVisual(q);
  const trail = state.slotResults.map((r,i) => {
    if(i > state.idx) return '<span class="dot"></span>';
    if(r === true) return '<span class="dot correct"></span>';
    if(r === false) return '<span class="dot incorrect"></span>';
    return '<span class="dot"></span>';
  }).join('');

  const liveSegment = state.answered ? 0 : (Date.now() - (state.questionStartTime || Date.now()));
  const qDisplayMs = state.answered ? state.lastQuestionTimeMs : liveSegment;
  const roundDisplayMs = state.roundAccumulatedMs + liveSegment;

  return `
    <div class="brand"><h1 style="font-size:20px;">Matematika Dasar</h1><div class="stars">${totalStars} Bintang</div></div>
    <div class="trail">${trail}</div>
    <div class="card">
      <div class="quiz-top">
        <button class="back" id="backBtn">← Kembali</button>
        <span class="qnum">Soal ${state.idx+1} / 10</span>
      </div>
      ${timerDisplayEnabled ? `
      <div class="timer-row">
        <span class="timer-chip">Waktu soal: <b id="qTimer">${formatDuration(qDisplayMs)}</b></span>
        <span class="timer-chip">Waktu total: <b id="roundTimer">${formatDuration(roundDisplayMs)}</b></span>
      </div>
      ` : ''}
      <div class="question-text">${questionText(q)}</div>
      ${visual ? `<div class="visual-box">${visual}</div>` : ''}
      <div class="answer-row">
        <input type="number" inputmode="numeric" id="answerInput" placeholder="Jawaban kamu" autocomplete="off" ${state.answered?'disabled':''}>
      </div>
      <button class="check-btn ${state.answered?'next':''}" id="actionBtn">${state.answered ? (state.idx===9 ? 'Lihat Hasil' : 'Soal Berikutnya') : 'Periksa Jawaban'}</button>
      <div class="feedback ${state.answered ? 'show '+(state.lastCorrect?'correct':'incorrect') : ''}" id="feedbackBox">
        <span>${state.feedbackMsg || ''}</span>
      </div>
    </div>
  `;
}

/* ---------------- Result ---------------- */
function resultScreen(){
  const score = state.correctCount;
  let title='Latihan selesai.';
  if(score === 10){ title='Sempurna.'; }
  else if(score >= 7){ title='Hasil yang sangat baik.'; }
  else if(score >= 4){ title='Teruslah berlatih.'; }
  else { title='Coba lagi, kamu pasti bisa.'; }

  return `
    <div class="brand"><h1 style="font-size:20px;">Matematika Dasar</h1><div class="stars">${totalStars} Bintang</div></div>
    <div class="card">
      <div class="result-title">${title}</div>
      <div class="result-sub">Kategori: ${state.chosenOp === 'campur' ? 'Campuran' : OP_LABELS[state.chosenOp].label}</div>
      <div class="result-score">${score} / 10</div>
      <div class="result-stars">Kamu memperoleh ${score} bintang baru</div>
      <div class="result-actions">
        <button class="start-btn" id="playAgainBtn">Main Lagi</button>
        <button class="check-btn" id="homeBtn" style="background:rgba(255,255,255,0.1); box-shadow:0 5px 0 rgba(0,0,0,0.25);">Ganti Kategori</button>
      </div>
    </div>
  `;
}

/* ---------------- Riwayat Soal ---------------- */
function riwayatScreen(){
  const history = loadHistory();
  let body;
  if(history.length === 0){
    body = `<div class="empty-state">Belum ada riwayat latihan. Mulai latihan pertama kamu.</div>`;
  } else {
    body = `<div class="history-list">${history.slice(0,50).map(h => `
      <div class="history-item">
        <span class="h-op">${h.op === 'campur' ? 'Campuran' : (OP_LABELS[h.op] ? OP_LABELS[h.op].label : h.op)}</span>
        <div class="h-info"><div class="h-date">${formatDate(h.date)} · ${formatDuration(h.timeMs)}</div></div>
        <div class="h-score">${h.score}/${h.total}</div>
      </div>
    `).join('')}</div>`;
  }
  return `
    <div class="brand"><h1 style="font-size:20px;">Riwayat Soal</h1><div class="stars">${totalStars} Bintang</div></div>
    <div class="subtitle">Seluruh riwayat latihan yang telah kamu selesaikan.</div>
    ${history.length > 0 ? `<button class="check-btn" id="clearHistoryBtn" style="background:rgba(255,107,91,0.18); box-shadow:0 5px 0 rgba(255,107,91,0.3); color:#FF9585; margin-bottom:16px;">Hapus Riwayat dan Bintang</button>` : ''}
    <div class="card">${body}</div>
  `;
}

/* ---------------- Topscore ---------------- */
function topscoreScreen(){
  const history = loadHistory();
  const bestPerOp = {};
  ['tambah','kurang','kali','bagi','campur'].forEach(op => { bestPerOp[op] = null; });
  history.forEach(h => {
    if(!bestPerOp[h.op] || h.score > bestPerOp[h.op].score) bestPerOp[h.op] = h;
  });

  const cards = ['tambah','kurang','kali','bagi','campur'].map(op => {
    const label = op === 'campur' ? 'Campuran' : OP_LABELS[op].label;
    const best = bestPerOp[op];
    return `
      <div class="topscore-card">
        <div class="ts-op">${label}</div>
        ${best ? `<div class="ts-score">${best.score}/10</div>` : `<div class="ts-empty">Belum ada</div>`}
      </div>`;
  }).join('');

  const top5 = history.slice().sort((a,b) => b.score - a.score || new Date(b.date)-new Date(a.date)).slice(0,5);
  const leaderboard = top5.length === 0
    ? `<div class="empty-state">Belum ada data untuk ditampilkan.</div>`
    : top5.map((h,i) => `
      <div class="leaderboard-row">
        <span class="rank">${i+1}</span>
        <div class="lb-info">
          <div class="lb-op">${h.op === 'campur' ? 'Campuran' : (OP_LABELS[h.op] ? OP_LABELS[h.op].label : h.op)}</div>
          <div class="lb-date">${formatDate(h.date)} · ${formatDuration(h.timeMs)}</div>
        </div>
        <div class="lb-score">${h.score}/10</div>
      </div>
    `).join('');

  const starRecordHtml = `
    <div class="topscore-section">
      <h3 style="margin-bottom:10px;">Rekor Bintang Tertinggi</h3>
      <div class="card" style="text-align:center; padding:22px;">
        ${cachedStarRecord && cachedStarRecord.best_star_count > 0 ? `
          <div class="result-score" style="margin-bottom:4px;">${cachedStarRecord.best_star_count}</div>
          <div class="result-sub" style="margin-bottom:0;">${cachedStarRecord.best_day_name || ''}${cachedStarRecord.best_day_name ? ' · ' : ''}${formatSqlDateClient(cachedStarRecord.best_date)}</div>
        ` : `<div class="empty-state">Belum ada rekor. Kumpulkan bintang untuk mencatatkan rekor pertamamu.</div>`}
      </div>
    </div>
  `;

  return `
    <div class="brand"><h1 style="font-size:20px;">Topscore</h1><div class="stars">${totalStars} Bintang</div></div>
    <div class="subtitle">Skor terbaik kamu di setiap kategori.</div>
    ${starRecordHtml}
    <div class="topscore-section">
      <div class="topscore-grid">${cards}</div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;">5 Percobaan Terbaik</h3>
      ${leaderboard}
    </div>
  `;
}

/* ---------------- Kosakata Inggris ---------------- */
function kosakataScreen(){
  if(!sb){
    return `
      <div class="brand"><h1 style="font-size:20px;">Bahasa Inggris</h1></div>
      <div class="card"><div class="empty-state">Supabase belum dikonfigurasi.</div></div>
    `;
  }
  if(vocabLoading){
    return `
      <div class="brand"><h1 style="font-size:20px;">Bahasa Inggris</h1></div>
      <div class="card"><div class="loading-line">Memuat kosakata...</div></div>
    `;
  }
  if(!vocabList || vocabList.length === 0){
    return `
      <div class="brand"><h1 style="font-size:20px;">Bahasa Inggris</h1></div>
      <div class="subtitle">Belum ada kosakata. Tambahkan lewat Menu Admin.</div>
      <div class="card"><div class="empty-state">Kosakata masih kosong.</div></div>
    `;
  }
  const v = currentVocabWord;
  return `
    <div class="brand"><h1 style="font-size:20px;">Bahasa Inggris</h1></div>
    <div class="subtitle">Latihan kosakata harian, sayangku.</div>
    <div class="vocab-filters">
      <select id="vocabLevelFilter">
        <option value="all" ${vocabFilter.level==='all'?'selected':''}>Semua level</option>
        ${['A1','A2','B1','B2'].map(l => `<option value="${l}" ${vocabFilter.level===l?'selected':''}>${l}</option>`).join('')}
      </select>
      <select id="vocabCategoryFilter">
        <option value="all" ${vocabFilter.category==='all'?'selected':''}>Semua kategori</option>
        ${vocabCategories.map(c => `<option value="${escapeHtml(c)}" ${vocabFilter.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>
    ${v ? `
    <div class="card vocab-card">
      <div class="vocab-badges">
        <span class="vocab-badge level">${escapeHtml(v.level || '-')}</span>
        <span class="vocab-badge category">${escapeHtml(v.category || '-')}</span>
      </div>
      <div class="vocab-word-row">
        <span class="vocab-word">${escapeHtml(v.word)}</span>
        <span class="vocab-ipa">${escapeHtml(v.ipa || '')}</span>
      </div>
      <div class="vocab-pos">${escapeHtml(v.pos || '')}</div>
      <div class="vocab-meaning">${escapeHtml(v.meaning)}</div>
      ${v.example ? `<div class="vocab-example">“${escapeHtml(v.example)}”</div>` : ''}
      <div class="vocab-actions">
        <button class="start-btn" id="vocabRandomBtn">Kata Random</button>
        <button class="check-btn" id="vocabSpeakBtn" style="background:rgba(255,255,255,0.1); box-shadow:0 5px 0 rgba(0,0,0,0.25);">🔊 Dengar</button>
      </div>
    </div>
    ` : `<div class="card"><div class="empty-state">Tidak ada kata untuk filter ini.</div></div>`}
  `;
}

/* ---------------- Latihan Terjemahan ---------------- */
function terjemahanScreen(){
  if(!sb){
    return `
      <div class="brand"><h1 style="font-size:20px;">Latihan Terjemahan</h1></div>
      <div class="card"><div class="empty-state">Supabase belum dikonfigurasi.</div></div>
    `;
  }
  if(translationLoading){
    return `
      <div class="brand"><h1 style="font-size:20px;">Latihan Terjemahan</h1></div>
      <div class="card"><div class="loading-line">Memuat soal terjemahan...</div></div>
    `;
  }
  if(!translationItems || translationItems.length < 4){
    return `
      <div class="brand"><h1 style="font-size:20px;">Latihan Terjemahan</h1></div>
      <div class="subtitle">Minimal butuh 4 soal aktif biar pilihan gandanya bisa dibuat. Tambahkan lewat Menu Admin.</div>
      <div class="card"><div class="empty-state">Soal terjemahan masih kurang dari 4.</div></div>
    `;
  }

  const dirLabel = { id_en: 'Indonesia → Inggris', en_id: 'Inggris → Indonesia', campur: 'Campur' };
  const q = currentTranslationQ;

  const optionsHtml = q ? q.options.map(opt => {
    let cls = 'trans-option';
    if(translationAnswered){
      if(opt === q.correctText) cls += ' correct';
      else if(opt === translationSelected) cls += ' incorrect';
    }
    return `<button class="${cls}" data-opt="${escapeHtml(opt)}" ${translationAnswered ? 'disabled':''}>${escapeHtml(opt)}</button>`;
  }).join('') : '';

  return `
    <div class="brand"><h1 style="font-size:20px;">Latihan Terjemahan</h1></div>
    <div class="subtitle">Benar ${translationScore.correct} dari ${translationScore.total} soal.</div>
    <div class="vocab-filters">
      <select id="translationDirSelect">
        <option value="campur" ${translationDirection==='campur'?'selected':''}>${dirLabel.campur}</option>
        <option value="id_en" ${translationDirection==='id_en'?'selected':''}>${dirLabel.id_en}</option>
        <option value="en_id" ${translationDirection==='en_id'?'selected':''}>${dirLabel.en_id}</option>
      </select>
    </div>
    ${q ? `
    <div class="card">
      <div class="vocab-badges">
        <span class="vocab-badge category">${q.dir === 'id_en' ? 'Indonesia → Inggris' : 'Inggris → Indonesia'}</span>
      </div>
      <div class="trans-question">${escapeHtml(q.sourceText)}</div>
      <div class="trans-options">${optionsHtml}</div>
      ${translationAnswered ? `<button class="start-btn" id="transNextBtn" style="margin-top:18px;">Soal Berikutnya</button>` : ''}
    </div>
    ` : `<div class="card"><div class="empty-state">Tidak bisa membuat soal, coba lagi.</div></div>`}
  `;
}

/* ---------------- Event handlers ---------------- */
function attachHandlers(){
  const hamburger = document.getElementById('hamburgerBtn');
  if(hamburger){
    hamburger.addEventListener('click', () => { state.sidebarOpen = !state.sidebarOpen; render(); });
  }
  const backdrop = document.getElementById('sidebarBackdrop');
  if(backdrop){
    backdrop.addEventListener('click', () => { state.sidebarOpen = false; render(); });
  }
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.screen = btn.dataset.nav;
      state.sidebarOpen = false;
      render();
      if((state.screen === 'topscore' || state.screen === 'riwayat') && sb && username){
        fetchServerHistory().then(h => {
          if(h) cachedServerHistory = h;
          if(state.screen === 'topscore' || state.screen === 'riwayat') render();
        });
      }
      if(state.screen === 'topscore' && sb){
        fetchStarRecord().then(rec => {
          cachedStarRecord = rec;
          if(state.screen === 'topscore') render();
        });
      }
      if(state.screen === 'kosakata' && sb && vocabList === null){
        vocabLoading = true;
        render();
        fetchVocabList().then(list => {
          vocabList = list;
          vocabCategories = [...new Set(list.map(v => v.category).filter(Boolean))].sort();
          vocabLoading = false;
          pickRandomVocab();
          if(state.screen === 'kosakata') render();
        });
      }
      if(state.screen === 'terjemahan' && sb && translationItems === null){
        translationLoading = true;
        render();
        fetchTranslationItems().then(list => {
          translationItems = list;
          translationLoading = false;
          generateTranslationQuestion();
          if(state.screen === 'terjemahan') render();
        });
      }
    });
  });

  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if(clearHistoryBtn){
    clearHistoryBtn.addEventListener('click', () => {
      if(!confirm('Hapus seluruh riwayat soal dan bintang untuk pengguna dengan nama "' + (username||'-') + '"? Data ini akan dihapus dari server, bukan hanya perangkat ini. Data jawaban pada panel Koreksi Jawaban di dashboard admin tidak terpengaruh.')) return;
      logDailyStars(todayStr(), totalStars, 'manual');
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STAR_DATE_KEY, todayStr());
      totalStars = 0;
      cachedServerHistory = null;
      if(sb && username){
        sb.from('round_history').delete().eq('username', username).then(()=>{}, (err) => console.warn('Gagal hapus riwayat server:', err));
        pushProgressToServer();
      }
      render();
    });
  }

  if(state.screen === 'welcome'){
    const input = document.getElementById('usernameInput');
    if(input) input.focus();
    const btn = document.getElementById('saveUsernameBtn');
    if(btn){
      btn.addEventListener('click', async () => {
        const val = (input.value || '').trim();
        if(!val){ input.classList.add('wrong-shake'); setTimeout(()=>input.classList.remove('wrong-shake'),350); return; }
        username = val;
        localStorage.setItem(USERNAME_KEY, username);
        btn.disabled = true;
        btn.textContent = 'Memuat data...';
        if(sb){
          await syncProgressFromServer();
          performDailyResetCheck();
          pushProgressToServer();
        }
        cachedServerHistory = null;
        cachedStarRecord = null;
        state.screen = 'home';
        render();
      });
      input.addEventListener('keydown', (e) => { if(e.key === 'Enter') btn.click(); });
    }
  }

  if(state.screen === 'home'){
    const changeNameBtn = document.getElementById('changeNameBtn');
    if(changeNameBtn){
      changeNameBtn.addEventListener('click', () => { state.screen = 'welcome'; render(); });
    }
    document.querySelectorAll('.op-card').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.op-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.chosenOp = btn.dataset.op;
        document.getElementById('startBtn').disabled = false;
      });
    });
    document.getElementById('startBtn').addEventListener('click', async () => {
      if(!state.chosenOp) return;
      state.screen = 'quiz';
      state.loading = true;
      state.idx = 0;
      state.correctCount = 0;
      state.answered = false;
      state.slotResults = new Array(10).fill(null);
      state.sessionId = genSessionId();
      render();
      state.questions = await generateRound(state.chosenOp);
      state.loading = false;
      state.roundAccumulatedMs = 0;
      state.lastQuestionTimeMs = 0;
      state.questionStartTime = Date.now();
      render();
    });
  }

  if(state.screen === 'quiz' && !state.loading){
    const input = document.getElementById('answerInput');
    input.focus();
    startLiveTimer();
    const actionBtn = document.getElementById('actionBtn');
    document.getElementById('backBtn').addEventListener('click', () => { state.screen='home'; render(); });

    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') actionBtn.click(); });

    actionBtn.addEventListener('click', () => {
      if(!state.answered){
        const val = input.value.trim();
        if(val === ''){ input.classList.add('wrong-shake'); setTimeout(()=>input.classList.remove('wrong-shake'),350); return; }
        const q = state.questions[state.idx];
        const correct = parseInt(val,10) === q.answer;
        const questionTimeMs = Date.now() - (state.questionStartTime || Date.now());
        state.lastQuestionTimeMs = questionTimeMs;
        state.roundAccumulatedMs += questionTimeMs;
        state.answered = true;
        state.lastCorrect = correct;
        state.slotResults[state.idx] = correct;
        if(correct){
          state.correctCount++;
          totalStars++;
          localStorage.setItem(STORAGE_KEY, totalStars);
          pushProgressToServer();
          state.feedbackMsg = pick(ENCOURAGE_RIGHT);
          input.classList.add('right-glow');
        } else {
          state.feedbackMsg = `${pick(ENCOURAGE_WRONG)} Jawaban yang benar: ${q.answer}`;
          input.classList.add('wrong-shake');
        }
        if(sb){
          sb.from('submissions').insert([{
            session_id: state.sessionId,
            operation: state.chosenOp,
            question_text: questionText(q),
            student_answer: val,
            correct_answer: String(q.answer),
            auto_correct: correct,
            time_ms: questionTimeMs,
            username: username || null
          }]).then(()=>{}, (err) => console.warn('Gagal kirim jawaban ke admin:', err));
        }
        render();
      } else {
        if(state.idx === 9){
          const roundTimeMs = state.roundAccumulatedMs;
          saveHistoryEntry(state.chosenOp, state.correctCount, roundTimeMs);
          if(sb && state.sessionId){
            sb.from('submissions').update({ round_total_ms: roundTimeMs }).eq('session_id', state.sessionId)
              .then(()=>{}, (err) => console.warn('Gagal simpan total waktu:', err));
          }
          state.screen = 'result';
        } else {
          state.idx++;
          state.answered = false;
          state.questionStartTime = Date.now();
        }
        render();
      }
    });
  }

  if(state.screen === 'kosakata'){
    const levelSel = document.getElementById('vocabLevelFilter');
    const catSel = document.getElementById('vocabCategoryFilter');
    if(levelSel) levelSel.addEventListener('change', () => { vocabFilter.level = levelSel.value; pickRandomVocab(); render(); });
    if(catSel) catSel.addEventListener('change', () => { vocabFilter.category = catSel.value; pickRandomVocab(); render(); });
    const randomBtn = document.getElementById('vocabRandomBtn');
    if(randomBtn) randomBtn.addEventListener('click', () => { pickRandomVocab(); render(); });
    const speakBtn = document.getElementById('vocabSpeakBtn');
    if(speakBtn) speakBtn.addEventListener('click', speakVocabWord);
  }

  if(state.screen === 'terjemahan'){
    const dirSel = document.getElementById('translationDirSelect');
    if(dirSel){
      dirSel.addEventListener('change', () => {
        translationDirection = dirSel.value;
        generateTranslationQuestion();
        render();
      });
    }
    document.querySelectorAll('.trans-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if(translationAnswered) return;
        translationSelected = btn.dataset.opt;
        translationAnswered = true;
        translationScore.total++;
        if(translationSelected === currentTranslationQ.correctText) translationScore.correct++;
        render();
      });
    });
    const nextBtn = document.getElementById('transNextBtn');
    if(nextBtn){
      nextBtn.addEventListener('click', () => {
        generateTranslationQuestion();
        render();
      });
    }
  }

  if(state.screen === 'result'){
    document.getElementById('playAgainBtn').addEventListener('click', async () => {
      state.screen = 'quiz';
      state.loading = true;
      state.idx = 0;
      state.correctCount = 0;
      state.answered = false;
      state.slotResults = new Array(10).fill(null);
      state.sessionId = genSessionId();
      render();
      state.questions = await generateRound(state.chosenOp);
      state.loading = false;
      state.roundAccumulatedMs = 0;
      state.lastQuestionTimeMs = 0;
      state.questionStartTime = Date.now();
      render();
    });
    document.getElementById('homeBtn').addEventListener('click', () => { state.chosenOp=null; state.screen='home'; render(); });
  }
}

async function initApp(){
  await fetchAppSettings();
  if(username && sb){
    // Kalau localStorage kosong (cache/HP baru di-reset) tapi nama udah ada,
    // coba restore progress dari server dulu sebelum nentuin reset harian.
    const hadLocalDate = !!localStorage.getItem(STAR_DATE_KEY);
    if(!hadLocalDate){
      await syncProgressFromServer();
    }
    performDailyResetCheck();
    pushProgressToServer();
  } else if(username){
    performDailyResetCheck();
  }
  render();
}
initApp();
