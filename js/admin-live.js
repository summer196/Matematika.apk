/* ============================================================
   ADMIN-LIVE.JS — tab 'Sedang Aktif': pantau soal yang lagi
   dikerjain pengguna secara real-time (broadcast, bukan nunggu
   submit). Butuh admin-core.js dimuat sebelum ini. Dipanggil
   dari tryUnlock() di admin-core.js lewat setupAdminRealtime()
   di admin-realtime.js.
   ============================================================ */

const OP_LABEL_LIVE = { tambah:'Tambah', kurang:'Kurang', kali:'Kali', bagi:'Bagi' };
let liveActivityMap = {}; // username -> {operation, questionText, idx, total, startedAt, lastSeen}
const LIVE_STALE_MS = 60000; // dianggap "kayaknya udah berhenti" kalau 1 menit gak ada update (kartunya jadi abu-abu, tapi belum dibuang)
const LIVE_REMOVE_MS = 240000; // baru bener-bener dibuang dari daftar kalau 4 menit gak ada update sama sekali

function setupLiveMonitoring(){
  if(!sb) return;
  sb.channel('live-activity', { config: { broadcast: { self:false } } })
    .on('broadcast', { event:'activity' }, (msg) => {
      const p = msg.payload;
      if(!p || !p.username) return;
      liveActivityMap[p.username] = { ...p, lastSeen: Date.now() };
      renderLiveActivity();
    })
    .on('broadcast', { event:'cleared' }, (msg) => {
      const p = msg.payload;
      if(!p || !p.username) return;
      delete liveActivityMap[p.username];
      renderLiveActivity();
    })
    .subscribe((status) => console.log('[live-activity/admin] status:', status));

  // Cek berkala buat nge-gray-out/buang kartu yang udah lama gak update
  // (misal orangnya nutup tab tanpa sempat ke-broadcast "cleared")
  setInterval(() => {
    let changed = false;
    const now = Date.now();
    Object.keys(liveActivityMap).forEach(u => {
      const age = now - liveActivityMap[u].lastSeen;
      if(age > LIVE_REMOVE_MS){ delete liveActivityMap[u]; changed = true; }
    });
    renderLiveActivity();
  }, 5000);
}

function renderLiveActivity(){
  const wrap = document.getElementById('liveActivityWrap');
  if(!wrap) return; // tab belum pernah dibuka, gapapa, gak usah render

  const users = Object.keys(liveActivityMap);
  if(users.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada yang lagi ngerjain kuis.</div>`;
    return;
  }

  const now = Date.now();
  wrap.innerHTML = users.map(u => {
    const a = liveActivityMap[u];
    const age = now - a.lastSeen;
    const stale = age > LIVE_STALE_MS;
    const secAgo = Math.floor(age / 1000);
    const ageLabel = secAgo < 60 ? `${secAgo} detik lalu` : `${Math.floor(secAgo/60)} menit lalu`;
    return `
      <div class="live-card">
        <div class="live-dot ${stale ? 'stale':''}"></div>
        <div>
          <div class="live-name">${escapeHtml(u)}</div>
          <div class="live-detail">
            ${stale ? 'Kayaknya udah berhenti main —' : 'Lagi ngerjain'}
            soal <b>${OP_LABEL_LIVE[a.operation] || a.operation}</b> nomor <b>${a.idx + 1}/${a.total}</b>:
            "${escapeHtml(a.questionText || '-')}"
          </div>
          <div class="live-meta">Update terakhir ${ageLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}
