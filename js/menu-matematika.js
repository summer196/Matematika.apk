/* ============================================================
   MENU-MATEMATIKA.JS — layar Beranda, Kuis, Hasil, Riwayat, Topscore.
   Butuh core.js dimuat sebelum ini.
   ============================================================ */

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
      ${(questionSettings && questionSettings[q.op] && questionSettings[q.op].timerEnabled === false) ? '' : `
      <div class="timer-row">
        <span class="timer-chip">Waktu soal: <b id="qTimer">${formatDuration(qDisplayMs)}</b></span>
        <span class="timer-chip">Waktu total: <b id="roundTimer">${formatDuration(roundDisplayMs)}</b></span>
      </div>
      `}
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

/* ---------------- Handler khusus layar-layar Matematika ---------------- */
function attachRiwayatHandlers(){
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
}

function attachHomeHandlers(){
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

function attachQuizHandlers(){
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
          totalStars = Math.max(0, totalStars - 3);
          localStorage.setItem(STORAGE_KEY, totalStars);
          pushProgressToServer();
          state.feedbackMsg = `${pick(ENCOURAGE_WRONG)} Jawaban yang benar: ${q.answer} (−3 bintang)`;
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

function attachResultHandlers(){
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
}
