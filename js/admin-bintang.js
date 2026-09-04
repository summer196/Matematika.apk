/* ============================================================
   ADMIN-BINTANG.JS — Riwayat Bintang Harian, Rekor Bintang
   Tertinggi, dan Data Pengguna (tab Statistik).
   Butuh admin-core.js dimuat sebelum ini.
   ============================================================ */

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

