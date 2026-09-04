/* ============================================================
   MENU-KOSAKATA.JS — tab 'Bahasa Inggris' (kosakata random).
   Butuh core.js dimuat sebelum ini (pakai sb, escapeHtml, dst).
   ============================================================ */

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


/* ---------------- Handler khusus layar Kosakata ---------------- */
function attachVocabHandlers(){
  const levelSel = document.getElementById('vocabLevelFilter');
  const catSel = document.getElementById('vocabCategoryFilter');
  if(levelSel) levelSel.addEventListener('change', () => { vocabFilter.level = levelSel.value; pickRandomVocab(); render(); });
  if(catSel) catSel.addEventListener('change', () => { vocabFilter.category = catSel.value; pickRandomVocab(); render(); });
  const randomBtn = document.getElementById('vocabRandomBtn');
  if(randomBtn) randomBtn.addEventListener('click', () => { pickRandomVocab(); render(); });
  const speakBtn = document.getElementById('vocabSpeakBtn');
  if(speakBtn) speakBtn.addEventListener('click', speakVocabWord);
}

/* Dipanggil dari render.js pas orang pertama kali buka tab ini */
function loadVocabIfNeeded(){
  if(!sb || vocabList !== null) return;
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
