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

/* ---------------- Data ---------------- */
async function loadQuestions(){
  if(!sb){
    document.getElementById('tableWrap').innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi di supabase-config.js.</div>`;
    return;
  }
  const { data, error } = await sb.from('custom_questions').select('*').order('created_at', {ascending:false});
  if(error){
    document.getElementById('tableWrap').innerHTML = `<div class="empty-state">Gagal memuat soal: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allQuestions = data || [];
  renderStats();
  renderTable();
}

function renderStats(){
  document.getElementById('statTotal').textContent = allQuestions.length;
  document.getElementById('statActive').textContent = allQuestions.filter(q => q.is_active).length;
  document.getElementById('statInactive').textContent = allQuestions.filter(q => !q.is_active).length;
}

function renderTable(){
  const wrap = document.getElementById('tableWrap');
  const filtered = currentFilter === 'semua' ? allQuestions : allQuestions.filter(q => q.operation === currentFilter);
  if(filtered.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada soal pada kategori ini. Tambahkan melalui formulir di atas.</div>`;
    return;
  }
  const rows = filtered.map(q => `
    <tr data-id="${q.id}">
      <td data-label="Kategori"><span class="op-pill ${q.operation}">${OP_LABEL[q.operation] || q.operation}</span></td>
      <td data-label="Soal">${escapeHtml(q.question_text)}</td>
      <td data-label="Jawaban"><b>${escapeHtml(String(q.answer))}</b></td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${q.id}">Koreksi</button>
          <button class="btn-toggle ${q.is_active ? 'is-active':''}" data-action="toggle" data-id="${q.id}">${q.is_active ? 'Aktif':'Nonaktif'}</button>
          <button class="btn-delete" data-action="delete" data-id="${q.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Kategori</th><th>Soal</th><th>Jawaban</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteQuestion(btn.dataset.id));
  });
}

async function toggleActive(id){
  const q = allQuestions.find(x => x.id === id);
  if(!q) return;
  const { error } = await sb.from('custom_questions').update({ is_active: !q.is_active }).eq('id', id);
  if(error){ alert('Gagal ubah status: ' + error.message); return; }
  q.is_active = !q.is_active;
  renderStats();
  renderTable();
}

async function deleteQuestion(id){
  if(!confirm('Yakin ingin menghapus soal ini?')) return;
  const { error } = await sb.from('custom_questions').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allQuestions = allQuestions.filter(x => x.id !== id);
  renderStats();
  renderTable();
}

document.getElementById('filterRow').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if(!btn) return;
  document.querySelectorAll('#filterRow button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderTable();
});

/* ---------------- Kosongkan semua soal ---------------- */
document.getElementById('resetAllBtn').addEventListener('click', async () => {
  if(allQuestions.length === 0){
    alert('Belum ada soal untuk dihapus.');
    return;
  }
  const step1 = confirm(`Yakin ingin menghapus SEMUA ${allQuestions.length} soal khusus? Soal otomatis tidak terpengaruh, hanya soal yang ditambahkan secara manual yang akan terhapus.`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){
    alert('Dibatalkan, soal tidak dihapus.');
    return;
  }
  const btn = document.getElementById('resetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('custom_questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Kosongkan Semua Soal';
  if(error){
    alert('Gagal hapus semua: ' + error.message);
    return;
  }
  allQuestions = [];
  renderStats();
  renderTable();
  alert('Seluruh soal khusus telah dikosongkan.');
});

/* ---------------- Tambah soal baru ---------------- */
document.getElementById('submitBtn').addEventListener('click', async () => {
  const operation = document.getElementById('fOperation').value;
  const answer = document.getElementById('fAnswer').value.trim();
  const question_text = document.getElementById('fQuestion').value.trim();
  const note = document.getElementById('fNote').value.trim();
  const msg = document.getElementById('formMsg');

  if(!question_text || answer === '' || isNaN(Number(answer))){
    msg.textContent = 'Isi teks soal dan jawaban (angka) dulu ya.';
    msg.className = 'form-msg err';
    return;
  }
  if(!sb){
    msg.textContent = 'Supabase belum dikonfigurasi.';
    msg.className = 'form-msg err';
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('custom_questions').insert([{
    operation, question_text, answer: Number(answer), note: note || null, is_active: true
  }]).select();

  submitBtn.disabled = false;
  submitBtn.textContent = 'Simpan Soal';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  msg.textContent = 'Soal tersimpan dan langsung muncul pada aplikasi bidadari.';
  msg.className = 'form-msg ok';
  document.getElementById('fQuestion').value = '';
  document.getElementById('fAnswer').value = '';
  document.getElementById('fNote').value = '';

  if(data && data[0]) allQuestions.unshift(data[0]);
  renderStats();
  renderTable();
});

/* ---------------- Fitur Koreksi (edit soal via modal) ---------------- */
function openEditModal(id){
  const q = allQuestions.find(x => x.id === id);
  if(!q) return;
  currentEditId = id;
  document.getElementById('eOperation').value = q.operation;
  document.getElementById('eQuestion').value = q.question_text;
  document.getElementById('eAnswer').value = q.answer;
  document.getElementById('eNote').value = q.note || '';
  document.getElementById('editMsg').className = 'form-msg';
  document.getElementById('editMsg').textContent = '';
  document.getElementById('editModal').classList.add('show');
}

function closeEditModal(){
  currentEditId = null;
  document.getElementById('editModal').classList.remove('show');
}

document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e) => {
  if(e.target.id === 'editModal') closeEditModal();
});

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if(!currentEditId) return;
  const operation = document.getElementById('eOperation').value;
  const answer = document.getElementById('eAnswer').value.trim();
  const question_text = document.getElementById('eQuestion').value.trim();
  const note = document.getElementById('eNote').value.trim();
  const msg = document.getElementById('editMsg');

  if(!question_text || answer === '' || isNaN(Number(answer))){
    msg.textContent = 'Isi teks soal dan jawaban (angka) dulu ya.';
    msg.className = 'form-msg err';
    return;
  }

  const saveBtn = document.getElementById('editSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('custom_questions')
    .update({ operation, question_text, answer: Number(answer), note: note || null })
    .eq('id', currentEditId)
    .select();

  saveBtn.disabled = false;
  saveBtn.textContent = 'Simpan Perubahan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  const idx = allQuestions.findIndex(x => x.id === currentEditId);
  if(idx !== -1 && data && data[0]) allQuestions[idx] = data[0];
  renderStats();
  renderTable();
  closeEditModal();
});

/* ---------------- Koreksi Jawaban (review submissions) ---------------- */
const OP_LABEL_REVIEW = {tambah:'Tambah', kurang:'Kurang', kali:'Kali', bagi:'Bagi', campur:'Campuran'};

function formatDateAdmin(iso){
  const d = new Date(iso);
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${hh}:${mm}`;
}

async function loadSubmissions(){
  const wrap = document.getElementById('reviewWrap');
  if(!sb){
    wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi.</div>`;
    return;
  }
  wrap.innerHTML = `<div class="loading-line">Memuat jawaban...</div>`;
  const { data, error } = await sb.from('submissions').select('*').order('created_at', {ascending:false}).limit(500);
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat jawaban: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allSubmissions = data || [];
  renderReview();
  updateDashboardStats();
}

function updateDashboardStats(){
  const statSub = document.getElementById('statSubmissions');
  const statSess = document.getElementById('statSessions');
  if(statSub) statSub.textContent = allSubmissions.length;
  if(statSess){
    const uniqueSessions = new Set(allSubmissions.map(s => s.session_id));
    statSess.textContent = uniqueSessions.size;
  }
}

function groupBySession(subs){
  const order = [];
  const map = {};
  subs.forEach(s => {
    if(!map[s.session_id]){
      map[s.session_id] = { session_id: s.session_id, operation: s.operation, date: s.created_at, username: s.username, items: [] };
      order.push(s.session_id);
    }
    map[s.session_id].items.push(s);
  });
  return order.map(id => map[id]);
}

function effectiveStatus(item){
  if(item.admin_status === 'benar') return 'benar';
  if(item.admin_status === 'salah') return 'salah';
  return item.auto_correct ? 'benar' : 'salah';
}

function renderReview(){
  const wrap = document.getElementById('reviewWrap');
  if(allSubmissions.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada jawaban yang masuk. Data akan otomatis muncul di sini setelah bidadari mulai berlatih.</div>`;
    return;
  }
  const sessions = groupBySession(allSubmissions);
  wrap.innerHTML = sessions.map(sess => {
    const benarCount = sess.items.filter(i => effectiveStatus(i) === 'benar').length;
    const isOpen = !!openSessions[sess.session_id];
    const roundTotalMs = sess.items.find(i => i.round_total_ms != null)?.round_total_ms;
    const itemsHtml = sess.items.map(item => {
      const st = effectiveStatus(item);
      return `
        <div class="review-item" data-item-id="${item.id}">
          <div class="ri-q">${escapeHtml(item.question_text)}</div>
          <div class="ri-ans">Jawaban bidadari: <b>${escapeHtml(item.student_answer ?? '-')}</b> &nbsp;·&nbsp; Jawaban benar: <b>${escapeHtml(item.correct_answer ?? '-')}</b> &nbsp;·&nbsp; ⏱ <b>${formatDurationAdmin(item.time_ms)}</b></div>
          <div class="review-actions">
            <button class="status-btn benar ${st==='benar'?'active':''}" data-action="mark" data-status="benar" data-id="${item.id}">Benar</button>
            <button class="status-btn salah ${st==='salah'?'active':''}" data-action="mark" data-status="salah" data-id="${item.id}">Salah</button>
          </div>
          <div class="review-note-row">
            <textarea placeholder="Catatan buat bidadari (opsional)" data-note-id="${item.id}">${escapeHtml(item.admin_note || '')}</textarea>
            <button data-action="save-note" data-id="${item.id}">Simpan</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="session-card ${isOpen?'open':''}" data-session="${sess.session_id}">
        <div class="session-header">
          <div data-action="toggle-session" data-session="${sess.session_id}" style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:pointer; flex-wrap:wrap;">
            <span class="s-op">${OP_LABEL_REVIEW[sess.operation] || sess.operation || '-'}</span>
            ${sess.username ? `<span class="user-badge">${escapeHtml(sess.username)}</span>` : ''}
            <span class="s-date">${formatDateAdmin(sess.date)} · ⏱ ${formatDurationAdmin(roundTotalMs)}</span>
            <span class="s-score">${benarCount}/${sess.items.length}</span>
            <span class="chevron">▼</span>
          </div>
          <button class="status-btn" data-action="delete-session" data-session="${sess.session_id}" style="background:#FFEDEB; color:var(--coral-dark); flex-shrink:0;">Hapus</button>
        </div>
        <div class="session-body">${itemsHtml}</div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-action="toggle-session"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.session;
      openSessions[id] = !openSessions[id];
      renderReview();
    });
  });
  wrap.querySelectorAll('[data-action="delete-session"]').forEach(btn => {
    btn.addEventListener('click', () => deleteSession(btn.dataset.session));
  });
  wrap.querySelectorAll('[data-action="mark"]').forEach(btn => {
    btn.addEventListener('click', () => setAdminStatus(btn.dataset.id, btn.dataset.status));
  });
  wrap.querySelectorAll('[data-action="save-note"]').forEach(btn => {
    btn.addEventListener('click', () => saveNote(btn.dataset.id));
  });
}

async function deleteSession(sessionId){
  if(!confirm('Hapus seluruh jawaban pada sesi ini? Tindakan ini tidak dapat dibatalkan.')) return;
  const { error } = await sb.from('submissions').delete().eq('session_id', sessionId);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allSubmissions = allSubmissions.filter(x => x.session_id !== sessionId);
  delete openSessions[sessionId];
  renderReview();
}

document.getElementById('clearAllReviewBtn').addEventListener('click', async () => {
  if(allSubmissions.length === 0){ alert('Belum ada riwayat jawaban untuk dihapus.'); return; }
  const step1 = confirm(`Yakin ingin menghapus SEMUA riwayat jawaban (${allSubmissions.length} jawaban dari seluruh sesi)? Soal yang tersimpan tidak terpengaruh, hanya riwayat jawaban bidadari yang akan terhapus.`);
  if(!step1) return;
  const typed = prompt('Ketik HAPUS (huruf besar semua) buat konfirmasi:');
  if(typed !== 'HAPUS'){ alert('Dibatalkan.'); return; }
  const btn = document.getElementById('clearAllReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Hapus Semua Riwayat';
  if(error){ alert('Gagal hapus semua: ' + error.message); return; }
  allSubmissions = [];
  openSessions = {};
  renderReview();
  alert('Seluruh riwayat jawaban telah dikosongkan.');
});

async function setAdminStatus(id, status){
  const { error } = await sb.from('submissions').update({ admin_status: status }).eq('id', id);
  if(error){ alert('Gagal simpan koreksi: ' + error.message); return; }
  const item = allSubmissions.find(x => x.id === id);
  if(item) item.admin_status = status;
  renderReview();
}

async function saveNote(id){
  const textarea = document.querySelector(`textarea[data-note-id="${id}"]`);
  const note = textarea ? textarea.value.trim() : '';
  const { error } = await sb.from('submissions').update({ admin_note: note || null }).eq('id', id);
  if(error){ alert('Gagal simpan catatan: ' + error.message); return; }
  const item = allSubmissions.find(x => x.id === id);
  if(item) item.admin_note = note;
  alert('Catatan berhasil disimpan.');
}

document.getElementById('refreshReviewBtn').addEventListener('click', loadSubmissions);

/* ---------------- Pengaturan rentang angka soal otomatis (per orang) ---------------- */
const SETTINGS_LABELS = {
  tambah: {r1:'Angka pertama', r2:'Angka kedua'},
  kurang: {r1:'Angka awal (yang dikurangi)', r2:'Angka pengurang (maks.)'},
  kali:   {r1:'Faktor pertama', r2:'Faktor kedua'},
  bagi:   {r1:'Hasil bagi (jawaban)', r2:'Pembagi'}
};
const SETTINGS_DEFAULT_ROW = {range1_min:1, range1_max:10, range2_min:1, range2_max:10, timer_enabled:true};
let settingsTargetUser = ''; // '' = Default (berlaku semua orang)
let knownUsernames = [];

async function populateSettingsUserSelect(){
  const sel = document.getElementById('settingsUserSelect');
  if(!sb){ return; }
  const { data, error } = await sb.from('user_progress').select('username').order('username');
  if(!error && data){
    knownUsernames = [...new Set(data.map(r => r.username).filter(Boolean))];
  }
  const options = [`<option value="">Default (berlaku buat semua orang)</option>`]
    .concat(knownUsernames.map(u => `<option value="${escapeHtml(u)}" ${u===settingsTargetUser?'selected':''}>${escapeHtml(u)}</option>`));
  sel.innerHTML = options.join('');
  sel.value = settingsTargetUser;
}

document.getElementById('settingsUserSelect').addEventListener('change', (e) => {
  settingsTargetUser = e.target.value;
  loadSettings();
});

document.getElementById('settingsNewUserBtn').addEventListener('click', () => {
  const val = document.getElementById('settingsNewUserInput').value.trim();
  if(!val) return;
  if(!knownUsernames.includes(val)) knownUsernames.push(val);
  settingsTargetUser = val;
  document.getElementById('settingsNewUserInput').value = '';
  populateSettingsUserSelect();
  loadSettings();
});

async function loadSettings(){
  const wrap = document.getElementById('settingsWrap');
  const resetBtn = document.getElementById('resetUserSettingsBtn');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi.</div>`; return; }

  await populateSettingsUserSelect();
  resetBtn.style.display = settingsTargetUser ? 'block' : 'none';

  // Ambil baris default DAN baris khusus target, biar tau mana yang beneran ke-override
  const targets = settingsTargetUser ? ['', settingsTargetUser] : [''];
  const { data, error } = await sb.from('question_settings').select('*').in('username', targets);
  if(error){ wrap.innerHTML = `<div class="empty-state">Gagal memuat pengaturan: ${escapeHtml(error.message)}</div>`; return; }

  const defaultMap = {};
  const targetMap = {};
  (data || []).forEach(r => {
    if(r.username === '') defaultMap[r.operation] = r;
    else targetMap[r.operation] = r;
  });

  const ops = ['tambah','kurang','kali','bagi'];
  wrap.innerHTML = ops.map(op => {
    const row = targetMap[op] || defaultMap[op] || SETTINGS_DEFAULT_ROW;
    const inherited = settingsTargetUser && !targetMap[op];
    const timerOn = row.timer_enabled !== false;
    const lbl = SETTINGS_LABELS[op];
    return `
      <div class="settings-op-row">
        <div class="settings-op-title">${OP_LABEL[op]}${inherited ? ' <span style="font-weight:500; font-size:11px; color:var(--ink-soft);">(ikut Default)</span>' : ''}</div>
        <div class="settings-range-grid">
          <div><label>${lbl.r1} — min</label><input type="number" id="s_${op}_r1min" value="${row.range1_min}"></div>
          <div><label>${lbl.r1} — max</label><input type="number" id="s_${op}_r1max" value="${row.range1_max}"></div>
          <div><label>${lbl.r2} — min</label><input type="number" id="s_${op}_r2min" value="${row.range2_min}"></div>
          <div><label>${lbl.r2} — max</label><input type="number" id="s_${op}_r2max" value="${row.range2_max}"></div>
        </div>
        <div class="switch-row" style="padding:10px 0 0;">
          <div>
            <div class="switch-row-label" style="font-size:13px;">Tampilkan Timer</div>
            <div class="switch-row-desc">Khusus soal ${OP_LABEL[op]}.</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="s_${op}_timer" ${timerOn ? 'checked' : ''}>
            <span class="switch-slider"></span>
          </label>
        </div>
      </div>
    `;
  }).join('');
}

document.getElementById('resetUserSettingsBtn').addEventListener('click', async () => {
  if(!settingsTargetUser) return;
  if(!confirm(`Hapus pengaturan khusus buat "${settingsTargetUser}"? Dia bakal balik pakai Default.`)) return;
  const { error } = await sb.from('question_settings').delete().eq('username', settingsTargetUser);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  loadSettings();
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const ops = ['tambah','kurang','kali','bagi'];
  const msg = document.getElementById('settingsMsg');
  const rows = ops.map(op => ({
    username: settingsTargetUser,
    operation: op,
    range1_min: Number(document.getElementById(`s_${op}_r1min`).value),
    range1_max: Number(document.getElementById(`s_${op}_r1max`).value),
    range2_min: Number(document.getElementById(`s_${op}_r2min`).value),
    range2_max: Number(document.getElementById(`s_${op}_r2max`).value),
    timer_enabled: document.getElementById(`s_${op}_timer`).checked
  }));

  for(const r of rows){
    const vals = [r.range1_min, r.range1_max, r.range2_min, r.range2_max];
    if(vals.some(v => isNaN(v))){
      msg.textContent = 'Semua kolom angka harus keisi.';
      msg.className = 'form-msg err';
      return;
    }
    if(r.range1_min > r.range1_max || r.range2_min > r.range2_max){
      msg.textContent = `Nilai min gak boleh lebih besar dari max (cek bagian ${OP_LABEL[r.operation]}).`;
      msg.className = 'form-msg err';
      return;
    }
  }

  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  const { error } = await sb.from('question_settings').upsert(rows, { onConflict: 'username,operation' });
  btn.disabled = false;
  btn.textContent = 'Simpan Pengaturan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }
  msg.textContent = 'Tersimpan! Soal otomatis langsung pakai rentang baru ini mulai sekarang.';
  msg.className = 'form-msg ok';
});

/* ---------------- Timer helper buat panel Koreksi Jawaban ---------------- */
function formatDurationAdmin(ms){
  if(ms == null || isNaN(ms)) return '-';
  const totalSec = Math.round(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}d`;
}

/* ---------------- Riwayat Bintang Harian ---------------- */
function formatSqlDate(dateStr){
  const [y,m,d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
}

async function loadStarLog(){
  const wrap = document.getElementById('starsWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi.</div>`; return; }
  wrap.innerHTML = `<div class="loading-line">Memuat riwayat bintang...</div>`;
  const { data, error } = await sb.from('daily_star_log').select('*').order('log_date', {ascending:false}).order('created_at', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat riwayat bintang: ${escapeHtml(error.message)}</div>`;
    return;
  }
  starLog = data || [];
  renderStarLog();
}

function renderStarLog(){
  const wrap = document.getElementById('starsWrap');
  if(starLog.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada riwayat bintang harian. Data akan tercatat otomatis setiap pergantian hari atau saat dihapus secara manual.</div>`;
    return;
  }
  wrap.innerHTML = starLog.map(row => `
    <div class="star-log-row" data-star-id="${row.id}">
      <div class="star-log-date">
        <div class="sl-day">${escapeHtml(row.day_name || '-')}</div>
        <div class="sl-date">${formatSqlDate(row.log_date)}</div>
      </div>
      ${row.username ? `<span class="user-badge">${escapeHtml(row.username)}</span>` : ''}
      <span class="star-log-badge ${row.reset_type}">${row.reset_type === 'manual' ? 'Manual' : 'Otomatis'}</span>
      <div class="star-log-count">${row.star_count}</div>
      <button class="status-btn" data-action="delete-star" data-id="${row.id}" style="background:#FFEDEB; color:var(--coral-dark);">Hapus</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="delete-star"]').forEach(btn => {
    btn.addEventListener('click', () => deleteStarLog(btn.dataset.id));
  });
}

async function deleteStarLog(id){
  if(!confirm('Hapus entri riwayat bintang ini?')) return;
  const { error } = await sb.from('daily_star_log').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  starLog = starLog.filter(r => r.id !== id);
  renderStarLog();
}

document.getElementById('refreshStarsBtn').addEventListener('click', loadStarLog);

/* ---------------- Rekor Bintang Tertinggi (per username) ---------------- */
let allStarRecords = [];

async function loadStarRecord(){
  const wrap = document.getElementById('starRecordWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi.</div>`; return; }
  const { data, error } = await sb.from('star_record').select('*').order('best_star_count', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat rekor: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allStarRecords = data || [];
  renderStarRecord();
}

function renderStarRecord(){
  const wrap = document.getElementById('starRecordWrap');
  if(allStarRecords.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada rekor tercatat dari siapa pun.</div>`;
    return;
  }
  wrap.innerHTML = allStarRecords.map(rec => `
    <div class="star-log-row" data-record-username="${escapeHtml(rec.username)}">
      <div class="star-log-date">
        <div class="sl-day">${escapeHtml(rec.username)}</div>
        <div class="sl-date">${rec.best_day_name ? escapeHtml(rec.best_day_name) + ' · ' : ''}${rec.best_date ? formatSqlDate(rec.best_date) : '-'}</div>
      </div>
      <div class="star-log-count">${rec.best_star_count}</div>
      <button class="status-btn" data-action="delete-record" data-username="${escapeHtml(rec.username)}" style="background:#FFEDEB; color:var(--coral-dark);">Hapus</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="delete-record"]').forEach(btn => {
    btn.addEventListener('click', () => resetOneRecord(btn.dataset.username));
  });
}

async function resetOneRecord(uname){
  if(!confirm(`Reset rekor bintang milik "${uname}" ke 0? Riwayat bintang harian tidak ikut terhapus.`)) return;
  const { error } = await sb.from('star_record').delete().eq('username', uname);
  if(error){ alert('Gagal reset rekor: ' + error.message); return; }
  allStarRecords = allStarRecords.filter(r => r.username !== uname);
  renderStarRecord();
}

document.getElementById('resetAllRecordsBtn').addEventListener('click', async () => {
  if(allStarRecords.length === 0){ alert('Belum ada rekor untuk direset.'); return; }
  const step1 = confirm(`Reset SEMUA rekor bintang (${allStarRecords.length} pengguna) ke 0? Riwayat bintang harian tidak ikut terhapus.`);
  if(!step1) return;
  const typed = prompt('Ketik HAPUS (huruf besar semua) buat konfirmasi:');
  if(typed !== 'HAPUS'){ alert('Dibatalkan.'); return; }
  const { error } = await sb.from('star_record').delete().neq('username', '__never_matches__');
  if(error){ alert('Gagal reset semua rekor: ' + error.message); return; }
  allStarRecords = [];
  renderStarRecord();
});

/* ---------------- Data Pengguna (progress per username, buat recovery) ---------------- */
async function loadUserProgress(){
  const wrap = document.getElementById('usersWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi.</div>`; return; }
  const { data, error } = await sb.from('user_progress').select('*').order('updated_at', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat data pengguna: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const users = data || [];
  if(users.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada pengguna yang tercatat. Nanti otomatis muncul begitu ada yang isi nama di app.</div>`;
    return;
  }
  wrap.innerHTML = users.map(u => `
    <div class="star-log-row">
      <div class="star-log-date">
        <div class="sl-day">${escapeHtml(u.username)}</div>
        <div class="sl-date">Update terakhir: ${new Date(u.updated_at).toLocaleString('id-ID', {dateStyle:'medium', timeStyle:'short'})}</div>
      </div>
      <div class="star-log-count">${u.total_stars} <span style="font-size:11px; color:var(--ink-soft); font-weight:700;">hari ini</span></div>
    </div>
  `).join('');
}

async function loadVocab(){
  const wrap = document.getElementById('vTableWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi di supabase-config.js.</div>`; return; }
  const { data, error } = await sb.from('vocabulary').select('*').order('created_at', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat kosakata: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allVocab = data || [];
  renderVocabTable();
}

function renderVocabTable(){
  const wrap = document.getElementById('vTableWrap');
  if(allVocab.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada kosakata. Tambahkan melalui formulir di atas.</div>`;
    return;
  }
  const rows = allVocab.map(v => `
    <tr data-id="${v.id}">
      <td data-label="Kata"><b>${escapeHtml(v.word)}</b><br><span style="color:var(--ink-soft); font-size:12px;">${escapeHtml(v.ipa || '')}</span></td>
      <td data-label="Arti">${escapeHtml(v.meaning)}</td>
      <td data-label="Level"><span class="op-pill" style="background:var(--sun-dark);">${escapeHtml(v.level || '-')}</span></td>
      <td data-label="Kategori">${escapeHtml(v.category || '-')}</td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${v.id}">Edit</button>
          <button class="btn-toggle ${v.is_active ? 'is-active':''}" data-action="toggle" data-id="${v.id}">${v.is_active ? 'Aktif':'Nonaktif'}</button>
          <button class="btn-delete" data-action="delete" data-id="${v.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Kata</th><th>Arti</th><th>Level</th><th>Kategori</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditVocabModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleVocabActive(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteVocab(btn.dataset.id));
  });
}

async function toggleVocabActive(id){
  const v = allVocab.find(x => x.id === id);
  if(!v) return;
  const { error } = await sb.from('vocabulary').update({ is_active: !v.is_active }).eq('id', id);
  if(error){ alert('Gagal ubah status: ' + error.message); return; }
  v.is_active = !v.is_active;
  renderVocabTable();
}

async function deleteVocab(id){
  if(!confirm('Yakin ingin menghapus kata ini?')) return;
  const { error } = await sb.from('vocabulary').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allVocab = allVocab.filter(x => x.id !== id);
  renderVocabTable();
}

document.getElementById('vResetAllBtn').addEventListener('click', async () => {
  if(allVocab.length === 0){ alert('Belum ada kosakata untuk dihapus.'); return; }
  const step1 = confirm(`Yakin ingin menghapus SEMUA ${allVocab.length} kata?`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){ alert('Dibatalkan, kosakata tidak dihapus.'); return; }
  const btn = document.getElementById('vResetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('vocabulary').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Kosongkan Semua Kata';
  if(error){ alert('Gagal hapus semua: ' + error.message); return; }
  allVocab = [];
  renderVocabTable();
  alert('Seluruh kosakata telah dikosongkan.');
});

/* ---------------- Tambah kata baru ---------------- */
document.getElementById('vSubmitBtn').addEventListener('click', async () => {
  const word = document.getElementById('vWord').value.trim();
  const ipa = document.getElementById('vIpa').value.trim();
  const pos = document.getElementById('vPos').value.trim();
  const level = document.getElementById('vLevel').value;
  const category = document.getElementById('vCategory').value.trim();
  const meaning = document.getElementById('vMeaning').value.trim();
  const example = document.getElementById('vExample').value.trim();
  const msg = document.getElementById('vFormMsg');

  if(!word || !meaning){
    msg.textContent = 'Isi kata dan arti dulu ya.';
    msg.className = 'form-msg err';
    return;
  }
  if(!sb){
    msg.textContent = 'Supabase belum dikonfigurasi.';
    msg.className = 'form-msg err';
    return;
  }

  const btn = document.getElementById('vSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('vocabulary').insert([{
    word, ipa: ipa || null, pos: pos || null, level, category: category || null,
    meaning, example: example || null, is_active: true
  }]).select();

  btn.disabled = false;
  btn.textContent = 'Simpan Kata';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  msg.textContent = 'Kata tersimpan dan langsung muncul di tab Bahasa Inggris.';
  msg.className = 'form-msg ok';
  document.getElementById('vWord').value = '';
  document.getElementById('vIpa').value = '';
  document.getElementById('vPos').value = '';
  document.getElementById('vCategory').value = '';
  document.getElementById('vMeaning').value = '';
  document.getElementById('vExample').value = '';

  if(data && data[0]) allVocab.unshift(data[0]);
  renderVocabTable();
});

/* ---------------- Edit kata (modal) ---------------- */
function openEditVocabModal(id){
  const v = allVocab.find(x => x.id === id);
  if(!v) return;
  currentEditVocabId = id;
  document.getElementById('evWord').value = v.word;
  document.getElementById('evIpa').value = v.ipa || '';
  document.getElementById('evPos').value = v.pos || '';
  document.getElementById('evLevel').value = v.level || 'A2';
  document.getElementById('evCategory').value = v.category || '';
  document.getElementById('evMeaning').value = v.meaning;
  document.getElementById('evExample').value = v.example || '';
  document.getElementById('evMsg').className = 'form-msg';
  document.getElementById('evMsg').textContent = '';
  document.getElementById('editVocabModal').classList.add('show');
}

function closeEditVocabModal(){
  currentEditVocabId = null;
  document.getElementById('editVocabModal').classList.remove('show');
}

document.getElementById('evCancelBtn').addEventListener('click', closeEditVocabModal);
document.getElementById('editVocabModal').addEventListener('click', (e) => {
  if(e.target.id === 'editVocabModal') closeEditVocabModal();
});

document.getElementById('evSaveBtn').addEventListener('click', async () => {
  if(!currentEditVocabId) return;
  const word = document.getElementById('evWord').value.trim();
  const ipa = document.getElementById('evIpa').value.trim();
  const pos = document.getElementById('evPos').value.trim();
  const level = document.getElementById('evLevel').value;
  const category = document.getElementById('evCategory').value.trim();
  const meaning = document.getElementById('evMeaning').value.trim();
  const example = document.getElementById('evExample').value.trim();
  const msg = document.getElementById('evMsg');

  if(!word || !meaning){
    msg.textContent = 'Isi kata dan arti dulu ya.';
    msg.className = 'form-msg err';
    return;
  }

  const saveBtn = document.getElementById('evSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  const { error } = await sb.from('vocabulary').update({
    word, ipa: ipa || null, pos: pos || null, level, category: category || null,
    meaning, example: example || null
  }).eq('id', currentEditVocabId);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Simpan Perubahan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  const idx = allVocab.findIndex(x => x.id === currentEditVocabId);
  if(idx > -1) allVocab[idx] = { ...allVocab[idx], word, ipa, pos, level, category, meaning, example };
  renderVocabTable();
  closeEditVocabModal();
});

/* ---------------- Latihan Terjemahan (tab Latihan Terjemahan) ---------------- */
async function loadTransItems(){
  const wrap = document.getElementById('tTableWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi di supabase-config.js.</div>`; return; }
  const { data, error } = await sb.from('translation_items').select('*').order('created_at', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat soal terjemahan: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allTransItems = data || [];
  renderTransTable();
}

function renderTransTable(){
  const wrap = document.getElementById('tTableWrap');
  if(allTransItems.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada soal terjemahan. Tambahkan melalui formulir di atas.</div>`;
    return;
  }
  const rows = allTransItems.map(t => `
    <tr data-id="${t.id}">
      <td data-label="Indonesia">${escapeHtml(t.text_id)}</td>
      <td data-label="Inggris">${escapeHtml(t.text_en)}</td>
      <td data-label="Level"><span class="op-pill" style="background:var(--sun-dark);">${escapeHtml(t.level || '-')}</span></td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${t.id}">Edit</button>
          <button class="btn-toggle ${t.is_active ? 'is-active':''}" data-action="toggle" data-id="${t.id}">${t.is_active ? 'Aktif':'Nonaktif'}</button>
          <button class="btn-delete" data-action="delete" data-id="${t.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Indonesia</th><th>Inggris</th><th>Level</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditTransModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleTransActive(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteTransItem(btn.dataset.id));
  });
}

async function toggleTransActive(id){
  const t = allTransItems.find(x => x.id === id);
  if(!t) return;
  const { error } = await sb.from('translation_items').update({ is_active: !t.is_active }).eq('id', id);
  if(error){ alert('Gagal ubah status: ' + error.message); return; }
  t.is_active = !t.is_active;
  renderTransTable();
}

async function deleteTransItem(id){
  if(!confirm('Yakin ingin menghapus soal ini?')) return;
  const { error } = await sb.from('translation_items').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allTransItems = allTransItems.filter(x => x.id !== id);
  renderTransTable();
}

document.getElementById('tResetAllBtn').addEventListener('click', async () => {
  if(allTransItems.length === 0){ alert('Belum ada soal untuk dihapus.'); return; }
  const step1 = confirm(`Yakin ingin menghapus SEMUA ${allTransItems.length} soal terjemahan?`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){ alert('Dibatalkan, soal tidak dihapus.'); return; }
  const btn = document.getElementById('tResetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('translation_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Kosongkan Semua Soal';
  if(error){ alert('Gagal hapus semua: ' + error.message); return; }
  allTransItems = [];
  renderTransTable();
  alert('Seluruh soal terjemahan telah dikosongkan.');
});

/* ---------------- Auto-translate (proxy /api/translate → MyMemory) ---------------- */
async function callTranslateApi(text, source, target){
  const url = `/api/translate?text=${encodeURIComponent(text)}&source=${source}&target=${target}`;
  const r = await fetch(url);
  const data = await r.json();
  if(!r.ok || data.error) throw new Error(data.error || 'Gagal menerjemahkan.');
  return data.translation;
}

document.getElementById('tTranslateToEnBtn').addEventListener('click', async () => {
  const text = document.getElementById('tTextId').value.trim();
  const msg = document.getElementById('tFormMsg');
  if(!text){ msg.textContent = 'Isi kalimat Indonesia dulu.'; msg.className = 'form-msg err'; return; }
  const btn = document.getElementById('tTranslateToEnBtn');
  btn.disabled = true; btn.textContent = 'Menerjemahkan...';
  try{
    const translated = await callTranslateApi(text, 'id', 'en');
    document.getElementById('tTextEn').value = translated;
    msg.textContent = ''; msg.className = 'form-msg';
  }catch(e){
    msg.textContent = 'Gagal terjemahin otomatis: ' + e.message + ' — isi manual aja.';
    msg.className = 'form-msg err';
  }
  btn.disabled = false; btn.textContent = 'Terjemahin ke Inggris →';
});

document.getElementById('tTranslateToIdBtn').addEventListener('click', async () => {
  const text = document.getElementById('tTextEn').value.trim();
  const msg = document.getElementById('tFormMsg');
  if(!text){ msg.textContent = 'Isi English sentence dulu.'; msg.className = 'form-msg err'; return; }
  const btn = document.getElementById('tTranslateToIdBtn');
  btn.disabled = true; btn.textContent = 'Menerjemahkan...';
  try{
    const translated = await callTranslateApi(text, 'en', 'id');
    document.getElementById('tTextId').value = translated;
    msg.textContent = ''; msg.className = 'form-msg';
  }catch(e){
    msg.textContent = 'Gagal terjemahin otomatis: ' + e.message + ' — isi manual aja.';
    msg.className = 'form-msg err';
  }
  btn.disabled = false; btn.textContent = '← Terjemahin ke Indonesia';
});

/* ---------------- Generate soal dari Kosakata ---------------- */
document.getElementById('tGenerateBtn').addEventListener('click', async () => {
  const msg = document.getElementById('tGenerateMsg');
  const btn = document.getElementById('tGenerateBtn');

  if(!allVocab || allVocab.length === 0){
    msg.textContent = 'Belum ada kosakata di tab Kosakata Inggris.';
    msg.className = 'form-msg err';
    return;
  }

  const existingExamples = new Set(allTransItems.map(t => t.text_en.trim().toLowerCase()));
  const candidates = allVocab.filter(v => v.example && v.example.trim() && !existingExamples.has(v.example.trim().toLowerCase()));

  if(candidates.length === 0){
    msg.textContent = 'Semua contoh kalimat dari kosakata sudah ada di bank soal terjemahan.';
    msg.className = 'form-msg ok';
    return;
  }

  btn.disabled = true;
  let done = 0, failed = 0;
  const total = candidates.length;

  for(const v of candidates){
    btn.textContent = `Menerjemahkan ${done + failed + 1}/${total}...`;
    msg.textContent = `Sedang generate: "${v.example}"`;
    msg.className = 'form-msg';
    try{
      const text_id = await callTranslateApi(v.example, 'en', 'id');
      const { data, error } = await sb.from('translation_items').insert([{
        text_id, text_en: v.example, level: v.level || 'A2', category: v.category || null, is_active: true
      }]).select();
      if(error) throw new Error(error.message);
      if(data && data[0]) allTransItems.unshift(data[0]);
      done++;
    }catch(e){
      console.warn('Gagal generate soal dari kosakata:', v.word, e.message);
      failed++;
    }
    renderTransTable();
    // jeda kecil biar gak kena rate limit MyMemory
    await new Promise(r => setTimeout(r, 600));
  }

  btn.disabled = false;
  btn.textContent = '🪄 Generate dari Kosakata';
  msg.textContent = `Selesai. ${done} soal berhasil dibuat${failed > 0 ? `, ${failed} gagal (coba generate ulang buat yang gagal).` : '.'}`;
  msg.className = failed > 0 ? 'form-msg err' : 'form-msg ok';
});
document.getElementById('tSubmitBtn').addEventListener('click', async () => {
  const text_id = document.getElementById('tTextId').value.trim();
  const text_en = document.getElementById('tTextEn').value.trim();
  const level = document.getElementById('tLevel').value;
  const category = document.getElementById('tCategory').value.trim();
  const msg = document.getElementById('tFormMsg');

  if(!text_id || !text_en){
    msg.textContent = 'Isi kalimat Indonesia dan Inggris dulu ya.';
    msg.className = 'form-msg err';
    return;
  }
  if(!sb){
    msg.textContent = 'Supabase belum dikonfigurasi.';
    msg.className = 'form-msg err';
    return;
  }

  const btn = document.getElementById('tSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('translation_items').insert([{
    text_id, text_en, level, category: category || null, is_active: true
  }]).select();

  btn.disabled = false;
  btn.textContent = 'Simpan Soal';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  msg.textContent = 'Soal tersimpan dan langsung muncul di Latihan Terjemahan.';
  msg.className = 'form-msg ok';
  document.getElementById('tTextId').value = '';
  document.getElementById('tTextEn').value = '';
  document.getElementById('tCategory').value = '';

  if(data && data[0]) allTransItems.unshift(data[0]);
  renderTransTable();
});

/* ---------------- Edit soal terjemahan (modal) ---------------- */
function openEditTransModal(id){
  const t = allTransItems.find(x => x.id === id);
  if(!t) return;
  currentEditTransId = id;
  document.getElementById('etTextId').value = t.text_id;
  document.getElementById('etTextEn').value = t.text_en;
  document.getElementById('etLevel').value = t.level || 'A2';
  document.getElementById('etCategory').value = t.category || '';
  document.getElementById('etMsg').className = 'form-msg';
  document.getElementById('etMsg').textContent = '';
  document.getElementById('editTransModal').classList.add('show');
}

function closeEditTransModal(){
  currentEditTransId = null;
  document.getElementById('editTransModal').classList.remove('show');
}

document.getElementById('etCancelBtn').addEventListener('click', closeEditTransModal);
document.getElementById('editTransModal').addEventListener('click', (e) => {
  if(e.target.id === 'editTransModal') closeEditTransModal();
});

document.getElementById('etSaveBtn').addEventListener('click', async () => {
  if(!currentEditTransId) return;
  const text_id = document.getElementById('etTextId').value.trim();
  const text_en = document.getElementById('etTextEn').value.trim();
  const level = document.getElementById('etLevel').value;
  const category = document.getElementById('etCategory').value.trim();
  const msg = document.getElementById('etMsg');

  if(!text_id || !text_en){
    msg.textContent = 'Isi kalimat Indonesia dan Inggris dulu ya.';
    msg.className = 'form-msg err';
    return;
  }

  const saveBtn = document.getElementById('etSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  const { error } = await sb.from('translation_items').update({
    text_id, text_en, level, category: category || null
  }).eq('id', currentEditTransId);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Simpan Perubahan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  const idx = allTransItems.findIndex(x => x.id === currentEditTransId);
  if(idx > -1) allTransItems[idx] = { ...allTransItems[idx], text_id, text_en, level, category };
  renderTransTable();
  closeEditTransModal();
});

document.getElementById('refreshUsersBtn').addEventListener('click', loadUserProgress);
