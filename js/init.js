/* ============================================================
   INIT.JS — nyalain aplikasi. HARUS jadi <script> PALING TERAKHIR
   di index.html, soalnya manggil render() yang butuh semua fungsi
   dari core.js, menu-*.js, dan render.js udah kemuat semua.
   ============================================================ */
async function initApp(){
  if(username && sb){
    // Kalau localStorage kosong (cache/HP baru di-reset) tapi nama udah ada,
    // coba restore progress dari server dulu sebelum nentuin reset harian.
    const hadLocalDate = !!localStorage.getItem(STAR_DATE_KEY);
    if(!hadLocalDate){
      await syncProgressFromServer();
    }
    performDailyResetCheck();
    pushProgressToServer();
  } else if(username){
    performDailyResetCheck();
  }
  setupRealtimeSubscriptions();
  window.addEventListener('pagehide', () => { if(state.screen === 'quiz') broadcastQuizCleared(); });
  document.addEventListener('visibilitychange', () => {
    // Layar HP kekunci / pindah app terus balik lagi → timer JS sempat "dibekukan"
    // browser, jadi detak jantung ke admin sempat berhenti. Begitu balik kelihatan,
    // langsung lapor status sekarang biar gak dianggep udah gak aktif.
    if(document.visibilityState === 'visible' && state.screen === 'quiz'){
      broadcastQuizActivity();
    }
  });
  render();
}
initApp();
