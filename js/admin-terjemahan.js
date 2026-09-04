/* ============================================================
   ADMIN-TERJEMAHAN.JS — tab 'Latihan Terjemahan' (translation_items
   CRUD, auto-translate via /api/translate, generate dari kosakata).
   Butuh admin-core.js DAN admin-kosakata.js dimuat sebelum ini
   (generate dari kosakata pakai variabel allVocab).
   ============================================================ */

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
