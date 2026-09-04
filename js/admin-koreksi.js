/* ============================================================
   ADMIN-KOREKSI.JS — tab 'Koreksi Jawaban' (review submissions).
   Butuh admin-core.js dimuat sebelum ini.
   ============================================================ */

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


/* ---------------- Timer helper buat panel Koreksi Jawaban ---------------- */
function formatDurationAdmin(ms){
  if(ms == null || isNaN(ms)) return '-';
  const totalSec = Math.round(ms/1000);
  const m = Math.floor(totalSec/60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}d`;
}

