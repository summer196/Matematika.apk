/* ============================================================
   ADMIN-CORE.JS — konfigurasi Supabase, state global, PIN gate,
   dan tab navigation. WAJIB dimuat PALING AWAL, sebelum semua
   file admin-*.js lainnya.
   ============================================================ */

/* ============================================================
   ADMIN.JS — logic dashboard admin (admin.html)
   Butuh supabase-js CDN + supabase-config.js dimuat sebelum ini.
   ============================================================ */

let sb = null;
try{
  if(typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL.indexOf('GANTI-DENGAN') === -1){
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
}catch(e){ console.warn(e); }

let allQuestions = [];
let allSubmissions = [];
let starLog = [];
let currentFilter = 'semua';
let currentEditId = null;
let openSessions = {};

let allVocab = [];
let currentEditVocabId = null;

let allTransItems = [];
let currentEditTransId = null;

const OP_LABEL = {tambah:'Tambah', kurang:'Kurang', kali:'Kali', bagi:'Bagi'};

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------- PIN gate ---------------- */
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

function tryUnlock(){
  const val = pinInput.value.trim();
  if(typeof ADMIN_PIN !== 'undefined' && val === String(ADMIN_PIN)){
    document.getElementById('pinGate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    loadQuestions();
    loadSubmissions();
    loadSettings();
    loadStarLog();
    loadStarRecord();
    loadUserProgress();
    loadVocab();
    loadTransItems();
  } else {
    pinError.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
  }
}
document.getElementById('pinSubmit').addEventListener('click', tryUnlock);
pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') tryUnlock(); });
pinInput.focus();

/* ---------------- Tab navigation ---------------- */
document.getElementById('adminTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.admin-tab');
  if(!btn) return;
  const target = btn.dataset.tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tabPanel === target));
});

