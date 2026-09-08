/* ============================================================
   ADMIN-REALTIME.JS — auto-refresh dashboard admin pas pengguna
   maen (submission baru, riwayat bintang, rekor, data pengguna).
   Butuh admin-core.js + admin-koreksi.js + admin-bintang.js
   dimuat sebelum ini. Dipanggil sekali dari tryUnlock() di
   admin-core.js, setelah PIN benar.
   ============================================================ */

let adminRealtimeStarted = false;

function setupAdminRealtime(){
  if(!sb || adminRealtimeStarted) return;
  adminRealtimeStarted = true;

  setupLiveMonitoring();

  sb.channel('admin-updates')
    // Jawaban baru masuk → tab Koreksi Jawaban auto-refresh
    .on('postgres_changes', { event:'*', schema:'public', table:'submissions' }, () => {
      loadSubmissions();
    })
    // Riwayat Bintang Harian
    .on('postgres_changes', { event:'*', schema:'public', table:'daily_star_log' }, () => {
      loadStarLog();
    })
    // Rekor Bintang Tertinggi
    .on('postgres_changes', { event:'*', schema:'public', table:'star_record' }, () => {
      loadStarRecord();
    })
    // Data Pengguna
    .on('postgres_changes', { event:'*', schema:'public', table:'user_progress' }, () => {
      loadUserProgress();
    })
    .subscribe();
}

onAdminUnlock(setupAdminRealtime);
