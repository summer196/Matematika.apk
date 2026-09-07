/* ============================================================
   REALTIME.JS — auto-refresh sisi APP (index.html) pas admin ubah
   data, tanpa ganggu soal yang lagi dikerjakan.
   Butuh core.js + menu-*.js + render.js dimuat sebelum ini.
   Dimuat SEBELUM init.js.

   Prinsip: kuis yang lagi berjalan (10 soal) udah "dibekukan" pas
   dibuat (rentang angka & status timer ikut kebawa di tiap objek
   soal), jadi aman invalidate cache kapan aja — soal yang lagi
   dikerjakan gak berubah, tapi ronde/kunjungan BERIKUTNYA otomatis
   pakai data terbaru.
   ============================================================ */

function setupRealtimeSubscriptions(){
  if(!sb) return;

  liveChannel = sb.channel('live-activity', { config: { broadcast: { self:false } } });
  liveChannel.subscribe();

  sb.channel('app-updates')
    // Rentang angka & timer diubah admin → reset cache, kepake mulai ronde berikutnya
    .on('postgres_changes', { event:'*', schema:'public', table:'question_settings' }, () => {
      questionSettings = null;
    })
    // Soal khusus ditambah/diubah admin → otomatis kepake ronde berikutnya (gak ada cache buat ini)
    .on('postgres_changes', { event:'*', schema:'public', table:'custom_questions' }, () => {
      // sengaja kosong: fetchCustomQuestions() selalu fetch fresh tiap generateRound()
    })
    // Kosakata ditambah/diubah/dihapus admin → refresh pool di background,
    // kata yang lagi ditampilkan gak ikut berubah
    .on('postgres_changes', { event:'*', schema:'public', table:'vocabulary' }, () => {
      fetchVocabList().then(list => {
        vocabList = list;
        vocabCategories = [...new Set(list.map(v => v.category).filter(Boolean))].sort();
        if(state.screen === 'kosakata') render();
      });
    })
    // Soal terjemahan ditambah/diubah/dihapus admin → refresh pool di background,
    // soal yang lagi ditampilkan gak ikut berubah
    .on('postgres_changes', { event:'*', schema:'public', table:'translation_items' }, () => {
      fetchTranslationItems().then(list => {
        translationItems = list;
        if(state.screen === 'terjemahan') render();
      });
    })
    // Ada jawaban baru masuk (dari device lain / sesi lain) → riwayat & topscore ikut update
    .on('postgres_changes', { event:'*', schema:'public', table:'round_history' }, () => {
      if(!username) return;
      fetchServerHistory().then(h => {
        if(h) cachedServerHistory = h;
        if(state.screen === 'riwayat' || state.screen === 'topscore') render();
      });
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'star_record' }, () => {
      fetchStarRecord().then(rec => {
        cachedStarRecord = rec;
        if(state.screen === 'topscore') render();
      });
    })
    .subscribe();
}

/* ---------------- Broadcast "lagi ngerjain soal apa" ke admin ---------------- */
let liveChannel = null;

function broadcastQuizActivity(){
  if(!liveChannel) return;
  const q = state.questions && state.questions[state.idx];
  if(!q) return;
  liveChannel.send({
    type: 'broadcast',
    event: 'activity',
    payload: {
      username: username || 'Tanpa nama',
      operation: q.op,
      questionText: questionText(q),
      idx: state.idx,
      total: state.questions.length,
      startedAt: Date.now()
    }
  });
}

function broadcastQuizCleared(){
  if(!liveChannel || !username) return;
  liveChannel.send({ type:'broadcast', event:'cleared', payload:{ username } });
}
