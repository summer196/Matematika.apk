/* ============================================================
   ADMIN-PENGATURAN.JS — tab 'Pengaturan' (rentang angka + timer,
   per orang & per operasi).
   Butuh admin-core.js dimuat sebelum ini.
   ============================================================ */

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

