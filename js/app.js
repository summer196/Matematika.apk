/* ============================================================
   APP.JS — logic app buat adek (index.html)
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

let totalStars = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);

function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveHistoryEntry(op, score){
  const history = loadHistory();
  history.unshift({ date: new Date().toISOString(), op, score, total: 10 });
  // Simpan maksimal 200 entri biar gak numpuk terus
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0,200)));
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
  screen: 'home', // home | quiz | result | riwayat | topscore
  chosenOp: null,
  questions: [],
  idx: 0,
  correctCount: 0,
  answered: false,
  slotResults: [],
  loading: false,
  sidebarOpen: false
};

const OP_LABELS = {
  tambah: {label:'Tambah', symbol:'+'},
  kurang: {label:'Kurang', symbol:'−'},
  kali:   {label:'Kali',   symbol:'×'},
  bagi:   {label:'Bagi',   symbol:'÷'}
};
const ALL_OPS = ['tambah','kurang','kali','bagi','campur'];

const ENCOURAGE_RIGHT = ['Wah pinter banget!', 'Betul sekali!', 'Keren, lanjut lagi!', 'Mantap!', 'Tepat sekali!'];
const ENCOURAGE_WRONG = ['Yuk coba lagi ya!', 'Hampir benar, semangat!', 'Gak apa-apa, kita belajar lagi!', 'Ayo dihitung pelan-pelan!'];

function rand(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------- Question generation (procedural) ---------------- */
function generateQuestion(op){
  if(op === 'campur') op = pick(['tambah','kurang','kali','bagi']);
  let a,b,answer;
  if(op === 'tambah'){ a=rand(1,10); b=rand(1,10); answer=a+b; }
  else if(op === 'kurang'){ a=rand(5,20); b=rand(1,a); answer=a-b; }
  else if(op === 'kali'){ a=rand(2,9); b=rand(2,9); answer=a*b; }
  else { b=rand(2,9); const q=rand(2,9); a=b*q; answer=q; }
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
  const custom = shuffle(await fetchCustomQuestions(chosenOp));
  if(custom.length >= 10) return custom.slice(0,10);
  let round = custom.slice();
  while(round.length < 10) round.push(generateQuestion(chosenOp));
  return shuffle(round);
}

/* ---------------- Visual renderers ---------------- */
function iconRow(count, extraClass){
  let out = '';
  for(let i=0;i<count;i++) out += `<span class="ic ${extraClass||''}">🍎</span>`;
  return out;
}

function renderVisual(q){
  if(q.isCustom){
    if(q.note) return `<div class="compact-visual">${escapeHtml(q.note)}</div>`;
    return `<div class="compact-visual"><span class="big">✨</span>Soal spesial dari kakak!</div>`;
  }
  const {op,a,b} = q;
  if(op === 'tambah'){
    return `<div class="icon-groups">
      <div class="icon-grid">${iconRow(a)}</div>
      <span class="op-symbol">+</span>
      <div class="icon-grid">${iconRow(b)}</div>
    </div>`;
  }
  if(op === 'kurang'){
    let icons = '';
    for(let i=0;i<a;i++) icons += `<span class="ic ${i >= a-b ? 'taken':''}">🍎</span>`;
    return `<div><div class="icon-grid" style="max-width:260px;">${icons}</div>
      <div class="compact-visual" style="margin-top:8px;">${b} buah diambil</div></div>`;
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
  const root = document.getElementById('root');
  root.innerHTML = sidebarHtml() + mainHtml();
  attachHandlers();
}

/* ---------------- Sidebar ---------------- */
function sidebarHtml(){
  const navItem = (screen, icon, label) => `
    <button class="nav-item ${state.screen === screen ? 'active':''}" data-nav="${screen}">
      <span class="ic">${icon}</span><span>${label}</span>
    </button>`;

  return `
    <div class="sidebar-backdrop ${state.sidebarOpen ? 'show':''}" id="sidebarBackdrop"></div>
    <div class="sidebar ${state.sidebarOpen ? 'open':''}" id="sidebar">
      <button class="hamburger-btn" id="hamburgerBtn">☰</button>
      <div class="sidebar-content">
        <div class="sidebar-title"><h1>Matematika</h1></div>
        <span class="sidebar-badge">Senyum Kenangan</span>
        <ul class="nav-list" style="list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:4px;">
          <li>${navItem('home','🏠','Main')}</li>
          <li>${navItem('riwayat','📜','Riwayat Soal')}</li>
          <li>${navItem('topscore','🏆','Topscore')}</li>
          <li><a class="nav-item" href="admin.html"><span class="ic">🔐</span><span>Menu Admin</span></a></li>
        </ul>
        <div class="sidebar-illustration">
          <img src="assets/senyum-kenangan.jpg" alt="Ichan & Michell">
        </div>
        <div class="sidebar-tagline">Semangat belajarnya, sayangku 💕</div>
      </div>
    </div>
  `;
}

function mainHtml(){
  let inner;
  if(state.screen === 'home') inner = homeScreen();
  else if(state.screen === 'quiz') inner = quizScreen();
  else if(state.screen === 'result') inner = resultScreen();
  else if(state.screen === 'riwayat') inner = riwayatScreen();
  else if(state.screen === 'topscore') inner = topscoreScreen();
  return `<div class="app"><div class="app-inner">${inner}</div></div>`;
}

/* ---------------- Home ---------------- */
function homeScreen(){
  return `
    <div class="brand"><span class="mascot">🐰</span><h1>Kebun Angka</h1><div class="stars">⭐ ${totalStars}</div></div>
    <div class="subtitle">Ayo berhitung sambil main di kebun buah!</div>
    <div class="card">
      <h2 style="font-size:18px;">Pilih materi</h2>
      <div class="op-grid">
        <button class="op-card" data-op="tambah"><span class="sym">+</span>Tambah</button>
        <button class="op-card" data-op="kurang"><span class="sym">−</span>Kurang</button>
        <button class="op-card" data-op="kali"><span class="sym">×</span>Kali</button>
        <button class="op-card" data-op="bagi"><span class="sym">÷</span>Bagi</button>
        <button class="op-card campur" data-op="campur"><span class="sym">🌈</span>Campuran</button>
      </div>
      <button class="start-btn" id="startBtn" disabled>Mulai Berpetualang</button>
      <div class="hint" id="homeHint">Pilih salah satu dulu ya, baru bisa mulai 🌻</div>
    </div>
  `;
}

/* ---------------- Quiz ---------------- */
function quizScreen(){
  if(state.loading){
    return `
      <div class="brand"><span class="mascot">🐰</span><h1 style="font-size:20px;">Kebun Angka</h1><div class="stars">⭐ ${totalStars}</div></div>
      <div class="card"><div class="loading-line">Menyiapkan soal... 🌱</div></div>
    `;
  }
  const q = state.questions[state.idx];
  const trail = state.slotResults.map((r,i) => {
    if(i > state.idx) return '<span>🌱</span>';
    if(r === true) return '<span class="done">🌸</span>';
    if(r === false) return '<span class="done">🍂</span>';
    return '<span>🌱</span>';
  }).join('');

  return `
    <div class="brand"><span class="mascot">🐰</span><h1 style="font-size:20px;">Kebun Angka</h1><div class="stars">⭐ ${totalStars}</div></div>
    <div class="trail">${trail}</div>
    <div class="card">
      <div class="quiz-top">
        <button class="back" id="backBtn">← Kembali</button>
        <span class="qnum">Soal ${state.idx+1} / 10</span>
      </div>
      <div class="question-text">${questionText(q)}</div>
      <div class="visual-box">${renderVisual(q)}</div>
      <div class="answer-row">
        <input type="number" inputmode="numeric" id="answerInput" placeholder="Jawabanmu" autocomplete="off" ${state.answered?'disabled':''}>
      </div>
      <button class="check-btn ${state.answered?'next':''}" id="actionBtn">${state.answered ? (state.idx===9 ? 'Lihat Hasil' : 'Soal Berikutnya') : 'Cek Jawaban'}</button>
      <div class="feedback ${state.answered ? 'show '+(state.lastCorrect?'correct':'incorrect') : ''}" id="feedbackBox">
        <span class="face">${state.lastCorrect ? '🎉' : '💪'}</span>
        <span>${state.feedbackMsg || ''}</span>
      </div>
    </div>
  `;
}

/* ---------------- Result ---------------- */
function resultScreen(){
  const score = state.correctCount;
  let emoji='🌟', title='Kerja bagus!';
  if(score === 10){ emoji='🏆'; title='Sempurna banget!'; }
  else if(score >= 7){ emoji='🌟'; title='Hebat sekali!'; }
  else if(score >= 4){ emoji='🌼'; title='Terus berlatih ya!'; }
  else { emoji='🌱'; title='Yuk coba lagi, pasti bisa!'; }

  return `
    <div class="brand"><span class="mascot">🐰</span><h1 style="font-size:20px;">Kebun Angka</h1><div class="stars">⭐ ${totalStars}</div></div>
    <div class="card">
      <div class="result-emoji">${emoji}</div>
      <div class="result-title">${title}</div>
      <div class="result-sub">Materi: ${state.chosenOp === 'campur' ? 'Campuran' : OP_LABELS[state.chosenOp].label}</div>
      <div class="result-score">${score} / 10</div>
      <div class="result-stars">Kamu dapat ${score} ⭐ baru</div>
      <div class="result-actions">
        <button class="start-btn" id="playAgainBtn">Main Lagi</button>
        <button class="check-btn" id="homeBtn" style="background:rgba(255,255,255,0.1); box-shadow:0 5px 0 rgba(0,0,0,0.25);">Ganti Materi</button>
      </div>
    </div>
  `;
}

/* ---------------- Riwayat Soal ---------------- */
function riwayatScreen(){
  const history = loadHistory();
  let body;
  if(history.length === 0){
    body = `<div class="empty-state">Belum ada riwayat main. Yuk mulai belajar dulu! 🌱</div>`;
  } else {
    body = `<div class="history-list">${history.slice(0,50).map(h => `
      <div class="history-item">
        <span class="h-op">${h.op === 'campur' ? 'Campuran' : (OP_LABELS[h.op] ? OP_LABELS[h.op].label : h.op)}</span>
        <div class="h-info"><div class="h-date">${formatDate(h.date)}</div></div>
        <div class="h-score">${h.score}/${h.total}</div>
      </div>
    `).join('')}</div>`;
  }
  return `
    <div class="brand"><span class="mascot">📜</span><h1 style="font-size:20px;">Riwayat Soal</h1><div class="stars">⭐ ${totalStars}</div></div>
    <div class="subtitle">Semua percobaan yang udah kamu kerjain</div>
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
    ? `<div class="empty-state">Belum ada percobaan buat dirangking.</div>`
    : top5.map((h,i) => `
      <div class="leaderboard-row">
        <span class="rank">${i+1}</span>
        <div class="lb-info">
          <div class="lb-op">${h.op === 'campur' ? 'Campuran' : (OP_LABELS[h.op] ? OP_LABELS[h.op].label : h.op)}</div>
          <div class="lb-date">${formatDate(h.date)}</div>
        </div>
        <div class="lb-score">${h.score}/10</div>
      </div>
    `).join('');

  return `
    <div class="brand"><span class="mascot">🏆</span><h1 style="font-size:20px;">Topscore</h1><div class="stars">⭐ ${totalStars}</div></div>
    <div class="subtitle">Skor terbaik kamu di tiap materi</div>
    <div class="topscore-section">
      <div class="topscore-grid">${cards}</div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px;">5 Percobaan Terbaik</h3>
      ${leaderboard}
    </div>
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
    });
  });

  if(state.screen === 'home'){
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
      render();
      state.questions = await generateRound(state.chosenOp);
      state.loading = false;
      render();
    });
  }

  if(state.screen === 'quiz' && !state.loading){
    const input = document.getElementById('answerInput');
    input.focus();
    const actionBtn = document.getElementById('actionBtn');
    document.getElementById('backBtn').addEventListener('click', () => { state.screen='home'; render(); });

    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') actionBtn.click(); });

    actionBtn.addEventListener('click', () => {
      if(!state.answered){
        const val = input.value.trim();
        if(val === ''){ input.classList.add('wrong-shake'); setTimeout(()=>input.classList.remove('wrong-shake'),350); return; }
        const q = state.questions[state.idx];
        const correct = parseInt(val,10) === q.answer;
        state.answered = true;
        state.lastCorrect = correct;
        state.slotResults[state.idx] = correct;
        if(correct){
          state.correctCount++;
          totalStars++;
          localStorage.setItem(STORAGE_KEY, totalStars);
          state.feedbackMsg = pick(ENCOURAGE_RIGHT);
          input.classList.add('right-glow');
        } else {
          state.feedbackMsg = `${pick(ENCOURAGE_WRONG)} Jawaban yang benar: ${q.answer}`;
          input.classList.add('wrong-shake');
        }
        render();
      } else {
        if(state.idx === 9){
          saveHistoryEntry(state.chosenOp, state.correctCount);
          state.screen = 'result';
        } else {
          state.idx++;
          state.answered = false;
        }
        render();
      }
    });
  }

  if(state.screen === 'result'){
    document.getElementById('playAgainBtn').addEventListener('click', async () => {
      state.screen = 'quiz';
      state.loading = true;
      state.idx = 0;
      state.correctCount = 0;
      state.answered = false;
      state.slotResults = new Array(10).fill(null);
      render();
      state.questions = await generateRound(state.chosenOp);
      state.loading = false;
      render();
    });
    document.getElementById('homeBtn').addEventListener('click', () => { state.chosenOp=null; state.screen='home'; render(); });
  }
}

render();
