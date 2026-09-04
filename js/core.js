/* ============================================================
   CORE.JS — konfigurasi Supabase, state global, util, sinkronisasi
   progress, dan pengaturan rentang angka (per-user).
   Dimuat PALING AWAL (setelah supabase-config.js), sebelum semua
   file menu-*.js dan render.js.
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
  tambah: {r1min:1,  r1max:10, r2min:1,  r2max:10, timerEnabled:true},
  kurang: {r1min:5,  r1max:20, r2min:1,  r2max:20, timerEnabled:true},
  kali:   {r1min:2,  r1max:9,  r2min:2,  r2max:9,  timerEnabled:true},
  bagi:   {r1min:2,  r1max:9,  r2min:2,  r2max:9,  timerEnabled:true}
};
let questionSettings = null;

async function loadQuestionSettings(){
  if(questionSettings) return questionSettings;
  if(!sb){ questionSettings = DEFAULT_SETTINGS; return questionSettings; }
  try{
    // Ambil baris default (username='') DAN baris khusus untuk orang ini (kalau ada)
    const targets = username ? ['', username] : [''];
    const { data, error } = await sb.from('question_settings').select('*').in('username', targets);
    if(error || !data || data.length === 0){ questionSettings = DEFAULT_SETTINGS; return questionSettings; }

    const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // Terapkan default global dulu...
    data.filter(r => r.username === '').forEach(row => {
      merged[row.operation] = { r1min:row.range1_min, r1max:row.range1_max, r2min:row.range2_min, r2max:row.range2_max, timerEnabled: row.timer_enabled !== false };
    });
    // ...baru override pakai pengaturan khusus orang ini (kalau ada), menang di atas default
    data.filter(r => r.username === username).forEach(row => {
      merged[row.operation] = { r1min:row.range1_min, r1max:row.range1_max, r2min:row.range2_min, r2max:row.range2_max, timerEnabled: row.timer_enabled !== false };
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

