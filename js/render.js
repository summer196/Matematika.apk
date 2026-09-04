/* ============================================================
   RENDER.JS — "lem" yang nyatuin semua menu jadi satu app.
   Isinya: render() utama, sidebar, dan attachHandlers() yang
   manggil fungsi attach-handler masing-masing menu.
   Harus dimuat SETELAH core.js + semua menu-*.js, tapi SEBELUM
   init.js.
   ============================================================ */

/* ---------------- Render root ---------------- */
function render(){
  stopLiveTimer();
  const root = document.getElementById('root');
  root.innerHTML = sidebarHtml() + mainHtml();
  attachHandlers();
}

function startLiveTimer(){
  stopLiveTimer();
  state.timerInterval = setInterval(() => {
    if(state.answered) return; // jeda total, gak update apa-apa selama nunggu klik lanjut
    const qEl = document.getElementById('qTimer');
    const rEl = document.getElementById('roundTimer');
    const currentSegment = Date.now() - (state.questionStartTime || Date.now());
    if(qEl) qEl.textContent = formatDuration(currentSegment);
    if(rEl) rEl.textContent = formatDuration(state.roundAccumulatedMs + currentSegment);
  }, 1000);
}
function stopLiveTimer(){
  if(state.timerInterval){ clearInterval(state.timerInterval); state.timerInterval = null; }
}

/* ---------------- Sidebar ---------------- */
function sidebarHtml(){
  const navItem = (screen, label) => `
    <button class="nav-item ${state.screen === screen ? 'active':''}" data-nav="${screen}">
      <span>${label}</span>
    </button>`;

  return `
    <div class="sidebar-backdrop ${state.sidebarOpen ? 'show':''}" id="sidebarBackdrop"></div>
    <div class="sidebar ${state.sidebarOpen ? 'open':''}" id="sidebar">
      <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu"><span class="hamburger-lines"></span></button>
      <div class="sidebar-content">
        <div class="sidebar-title"><h1>Matematika</h1></div>
        <span class="sidebar-badge">Senyum Kenangan</span>
        <ul class="nav-list" style="list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:4px;">
          <li>${navItem('home','Beranda')}</li>
          <li>${navItem('kosakata','Bahasa Inggris')}</li>
          <li>${navItem('terjemahan','Latihan Terjemahan')}</li>
          <li>${navItem('riwayat','Riwayat Soal')}</li>
          <li>${navItem('topscore','Topscore')}</li>
          <li><a class="nav-item" href="admin.html"><span>Menu Admin</span></a></li>
        </ul>
        <div class="sidebar-footer">
          <img class="sidebar-mini-avatar" src="assets/senyum-kenangan.jpg" alt="Ichan dan Michell">
          <span class="sidebar-tagline">Semangat belajarnya, sayangku</span>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- Dispatcher HTML: pilih screen mana yang dirender ---------------- */
function mainHtml(){
  let inner;
  if(state.screen === 'welcome') inner = welcomeScreen();
  else if(state.screen === 'home') inner = homeScreen();
  else if(state.screen === 'quiz') inner = quizScreen();
  else if(state.screen === 'result') inner = resultScreen();
  else if(state.screen === 'riwayat') inner = riwayatScreen();
  else if(state.screen === 'topscore') inner = topscoreScreen();
  else if(state.screen === 'kosakata') inner = kosakataScreen();
  else if(state.screen === 'terjemahan') inner = terjemahanScreen();
  return `<div class="app"><div class="app-inner">${inner}</div></div>`;
}

/* ---------------- Welcome (isi nama pertama kali) ---------------- */
function welcomeScreen(){
  return `
    <div class="card" style="text-align:center; margin-top:60px;">
      <h2 style="margin-bottom:6px;">Siapa nama kamu?</h2>
      <div class="subtitle" style="margin-bottom:18px;">Nama ini digunakan untuk menyimpan bintang dan riwayat jawaban kamu.</div>
      <input type="text" id="usernameInput" placeholder="Nama kamu" maxlength="40"
        style="width:100%; padding:14px; border-radius:16px; border:2px solid rgba(255,255,255,0.15); background:rgba(0,0,0,0.25); color:#fff; font-size:18px; text-align:center; margin-bottom:14px;">
      <button class="start-btn" id="saveUsernameBtn">Mulai</button>
    </div>
  `;
}

function attachWelcomeHandlers(){
  const input = document.getElementById('usernameInput');
  if(input) input.focus();
  const btn = document.getElementById('saveUsernameBtn');
  if(btn){
    btn.addEventListener('click', async () => {
      const val = (input.value || '').trim();
      if(!val){ input.classList.add('wrong-shake'); setTimeout(()=>input.classList.remove('wrong-shake'),350); return; }
      username = val;
      localStorage.setItem(USERNAME_KEY, username);
      questionSettings = null; // reset cache biar narik pengaturan khusus nama yang baru
      btn.disabled = true;
      btn.textContent = 'Memuat data...';
      if(sb){
        await syncProgressFromServer();
        performDailyResetCheck();
        pushProgressToServer();
      }
      cachedServerHistory = null;
      cachedStarRecord = null;
      state.screen = 'home';
      render();
    });
    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') btn.click(); });
  }
}

/* ---------------- Dispatcher event handlers: navigasi umum + panggil per-menu ---------------- */
function attachHandlers(){
  const hamburger = document.getElementById('hamburgerBtn');
  if(hamburger){
    hamburger.addEventListener('click', () => { state.sidebarOpen = !state.sidebarOpen; render(); });
  }
  const backdrop = document.getElementById('sidebarBackdrop');
  if(backdrop){
    backdrop.addEventListener('click', () => { state.sidebarOpen = false; render(); });
  }

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.screen = btn.dataset.nav;
      state.sidebarOpen = false;
      render();
      if((state.screen === 'topscore' || state.screen === 'riwayat') && sb && username){
        fetchServerHistory().then(h => {
          if(h) cachedServerHistory = h;
          if(state.screen === 'topscore' || state.screen === 'riwayat') render();
        });
      }
      if(state.screen === 'topscore' && sb){
        fetchStarRecord().then(rec => {
          cachedStarRecord = rec;
          if(state.screen === 'topscore') render();
        });
      }
      if(state.screen === 'kosakata') loadVocabIfNeeded();
      if(state.screen === 'terjemahan') loadTranslationIfNeeded();
    });
  });

  // Panggil fungsi attach-handler menu yang lagi aktif
  if(state.screen === 'welcome') attachWelcomeHandlers();
  else if(state.screen === 'home') attachHomeHandlers();
  else if(state.screen === 'quiz' && !state.loading) attachQuizHandlers();
  else if(state.screen === 'result') attachResultHandlers();
  else if(state.screen === 'riwayat') attachRiwayatHandlers();
  else if(state.screen === 'kosakata') attachVocabHandlers();
  else if(state.screen === 'terjemahan') attachTranslationHandlers();
}
