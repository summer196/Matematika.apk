/* ============================================================
   MENU-TERJEMAHAN.JS — tab 'Latihan Terjemahan' (MCQ dua arah).
   Butuh core.js dimuat sebelum ini.
   ============================================================ */

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


/* ---------------- Handler khusus layar Latihan Terjemahan ---------------- */
function attachTranslationHandlers(){
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

/* Dipanggil dari render.js pas orang pertama kali buka tab ini */
function loadTranslationIfNeeded(){
  if(!sb || translationItems !== null) return;
  translationLoading = true;
  render();
  fetchTranslationItems().then(list => {
    translationItems = list;
    translationLoading = false;
    generateTranslationQuestion();
    if(state.screen === 'terjemahan') render();
  });
}
