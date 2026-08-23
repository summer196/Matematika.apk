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
let currentFilter = 'semua';
let currentEditId = null;
let openSessions = {};

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
  } else {
    pinError.style.display = 'block';
    pinInput.value = '';
    pinInput.focus();
  }
}
document.getElementById('pinSubmit').addEventListener('click', tryUnlock);
pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') tryUnlock(); });
pinInput.focus();

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
    wrap.innerHTML = `<div class="empty-state">Belum ada soal di kategori ini. Tambahin dari form di atas ya 🌱</div>`;
    return;
  }
  const rows = filtered.map(q => `
    <tr data-id="${q.id}">
      <td data-label="Kategori"><span class="op-pill ${q.operation}">${OP_LABEL[q.operation] || q.operation}</span></td>
      <td data-label="Soal">${escapeHtml(q.question_text)}</td>
      <td data-label="Jawaban"><b>${escapeHtml(String(q.answer))}</b></td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${q.id}">✏️ Koreksi</button>
          <button class="btn-toggle ${q.is_active ? 'is-active':''}" data-action="toggle" data-id="${q.id}">${q.is_active ? '✓ Aktif':'Nonaktif'}</button>
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
  if(!confirm('Yakin mau hapus soal ini?')) return;
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
    alert('Belum ada soal buat dihapus.');
    return;
  }
  const step1 = confirm(`Yakin mau hapus SEMUA ${allQuestions.length} soal custom? Soal otomatis (generate) gak kepengaruh, cuma soal yang lo tambahin manual yang bakal hilang.`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){
    alert('Dibatalkan, gak jadi dihapus.');
    return;
  }
  const btn = document.getElementById('resetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('custom_questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = '🗑️ Kosongkan Semua Soal';
  if(error){
    alert('Gagal hapus semua: ' + error.message);
    return;
  }
  allQuestions = [];
  renderStats();
  renderTable();
  alert('Semua soal custom udah dikosongin.');
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

  msg.textContent = 'Soal tersimpan! Langsung muncul di app bidadari lo 🎉';
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
}

function groupBySession(subs){
  const order = [];
  const map = {};
  subs.forEach(s => {
    if(!map[s.session_id]){
      map[s.session_id] = { session_id: s.session_id, operation: s.operation, date: s.created_at, items: [] };
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
    wrap.innerHTML = `<div class="empty-state">Belum ada jawaban yang masuk. Nanti otomatis muncul di sini pas bidadari main 🌱</div>`;
    return;
  }
  const sessions = groupBySession(allSubmissions);
  wrap.innerHTML = sessions.map(sess => {
    const benarCount = sess.items.filter(i => effectiveStatus(i) === 'benar').length;
    const isOpen = !!openSessions[sess.session_id];
    const itemsHtml = sess.items.map(item => {
      const st = effectiveStatus(item);
      return `
        <div class="review-item" data-item-id="${item.id}">
          <div class="ri-q">${escapeHtml(item.question_text)}</div>
          <div class="ri-ans">Jawaban bidadari: <b>${escapeHtml(item.student_answer ?? '-')}</b> &nbsp;·&nbsp; Jawaban benar: <b>${escapeHtml(item.correct_answer ?? '-')}</b></div>
          <div class="review-actions">
            <button class="status-btn benar ${st==='benar'?'active':''}" data-action="mark" data-status="benar" data-id="${item.id}">✓ Benar</button>
            <button class="status-btn salah ${st==='salah'?'active':''}" data-action="mark" data-status="salah" data-id="${item.id}">✗ Salah</button>
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
          <div data-action="toggle-session" data-session="${sess.session_id}" style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:pointer;">
            <span class="s-op">${OP_LABEL_REVIEW[sess.operation] || sess.operation || '-'}</span>
            <span class="s-date">${formatDateAdmin(sess.date)}</span>
            <span class="s-score">${benarCount}/${sess.items.length}</span>
            <span class="chevron">▼</span>
          </div>
          <button class="status-btn" data-action="delete-session" data-session="${sess.session_id}" style="background:#FFEDEB; color:var(--coral-dark); flex-shrink:0;">🗑️</button>
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
  if(!confirm('Hapus semua jawaban di sesi ini? Gak bisa dibalikin lagi.')) return;
  const { error } = await sb.from('submissions').delete().eq('session_id', sessionId);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allSubmissions = allSubmissions.filter(x => x.session_id !== sessionId);
  delete openSessions[sessionId];
  renderReview();
}

document.getElementById('clearAllReviewBtn').addEventListener('click', async () => {
  if(allSubmissions.length === 0){ alert('Belum ada riwayat jawaban buat dihapus.'); return; }
  const step1 = confirm(`Yakin mau hapus SEMUA riwayat jawaban (${allSubmissions.length} jawaban dari semua sesi)? Ini gak kepengaruh ke soal-soal yang lo bikin, cuma riwayat jawaban bidadari doang.`);
  if(!step1) return;
  const typed = prompt('Ketik HAPUS (huruf besar semua) buat konfirmasi:');
  if(typed !== 'HAPUS'){ alert('Dibatalkan.'); return; }
  const btn = document.getElementById('clearAllReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = '🗑️ Hapus Semua Riwayat';
  if(error){ alert('Gagal hapus semua: ' + error.message); return; }
  allSubmissions = [];
  openSessions = {};
  renderReview();
  alert('Semua riwayat jawaban udah dikosongin.');
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
  alert('Catatan tersimpan.');
}

document.getElementById('refreshReviewBtn').addEventListener('click', loadSubmissions);
