/* ============================================================
   ADMIN-KOSAKATA.JS — tab 'Kosakata Inggris' (vocabulary CRUD).
   Butuh admin-core.js dimuat sebelum ini.
   ============================================================ */

async function loadVocab(){
  const wrap = document.getElementById('vTableWrap');
  if(!sb){ wrap.innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi di supabase-config.js.</div>`; return; }
  const { data, error } = await sb.from('vocabulary').select('*').order('created_at', {ascending:false});
  if(error){
    wrap.innerHTML = `<div class="empty-state">Gagal memuat kosakata: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allVocab = data || [];
  renderVocabTable();
}

function renderVocabTable(){
  const wrap = document.getElementById('vTableWrap');
  if(allVocab.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada kosakata. Tambahkan melalui formulir di atas.</div>`;
    return;
  }
  const rows = allVocab.map(v => `
    <tr data-id="${v.id}">
      <td data-label="Kata"><b>${escapeHtml(v.word)}</b><br><span style="color:var(--ink-soft); font-size:12px;">${escapeHtml(v.ipa || '')}</span></td>
      <td data-label="Arti">${escapeHtml(v.meaning)}</td>
      <td data-label="Level"><span class="op-pill" style="background:var(--sun-dark);">${escapeHtml(v.level || '-')}</span></td>
      <td data-label="Kategori">${escapeHtml(v.category || '-')}</td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${v.id}">Edit</button>
          <button class="btn-toggle ${v.is_active ? 'is-active':''}" data-action="toggle" data-id="${v.id}">${v.is_active ? 'Aktif':'Nonaktif'}</button>
          <button class="btn-delete" data-action="delete" data-id="${v.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Kata</th><th>Arti</th><th>Level</th><th>Kategori</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditVocabModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleVocabActive(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteVocab(btn.dataset.id));
  });
}

async function toggleVocabActive(id){
  const v = allVocab.find(x => x.id === id);
  if(!v) return;
  const { error } = await sb.from('vocabulary').update({ is_active: !v.is_active }).eq('id', id);
  if(error){ alert('Gagal ubah status: ' + error.message); return; }
  v.is_active = !v.is_active;
  renderVocabTable();
}

async function deleteVocab(id){
  if(!confirm('Yakin ingin menghapus kata ini?')) return;
  const { error } = await sb.from('vocabulary').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allVocab = allVocab.filter(x => x.id !== id);
  renderVocabTable();
}

document.getElementById('vResetAllBtn').addEventListener('click', async () => {
  if(allVocab.length === 0){ alert('Belum ada kosakata untuk dihapus.'); return; }
  const step1 = confirm(`Yakin ingin menghapus SEMUA ${allVocab.length} kata?`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){ alert('Dibatalkan, kosakata tidak dihapus.'); return; }
  const btn = document.getElementById('vResetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('vocabulary').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Kosongkan Semua Kata';
  if(error){ alert('Gagal hapus semua: ' + error.message); return; }
  allVocab = [];
  renderVocabTable();
  alert('Seluruh kosakata telah dikosongkan.');
});

/* ---------------- Tambah kata baru ---------------- */
document.getElementById('vSubmitBtn').addEventListener('click', async () => {
  const word = document.getElementById('vWord').value.trim();
  const ipa = document.getElementById('vIpa').value.trim();
  const pos = document.getElementById('vPos').value.trim();
  const level = document.getElementById('vLevel').value;
  const category = document.getElementById('vCategory').value.trim();
  const meaning = document.getElementById('vMeaning').value.trim();
  const example = document.getElementById('vExample').value.trim();
  const msg = document.getElementById('vFormMsg');

  if(!word || !meaning){
    msg.textContent = 'Isi kata dan arti dulu ya.';
    msg.className = 'form-msg err';
    return;
  }
  if(!sb){
    msg.textContent = 'Supabase belum dikonfigurasi.';
    msg.className = 'form-msg err';
    return;
  }

  const btn = document.getElementById('vSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('vocabulary').insert([{
    word, ipa: ipa || null, pos: pos || null, level, category: category || null,
    meaning, example: example || null, is_active: true
  }]).select();

  btn.disabled = false;
  btn.textContent = 'Simpan Kata';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  msg.textContent = 'Kata tersimpan dan langsung muncul di tab Bahasa Inggris.';
  msg.className = 'form-msg ok';
  document.getElementById('vWord').value = '';
  document.getElementById('vIpa').value = '';
  document.getElementById('vPos').value = '';
  document.getElementById('vCategory').value = '';
  document.getElementById('vMeaning').value = '';
  document.getElementById('vExample').value = '';

  if(data && data[0]) allVocab.unshift(data[0]);
  renderVocabTable();
});

/* ---------------- Edit kata (modal) ---------------- */
function openEditVocabModal(id){
  const v = allVocab.find(x => x.id === id);
  if(!v) return;
  currentEditVocabId = id;
  document.getElementById('evWord').value = v.word;
  document.getElementById('evIpa').value = v.ipa || '';
  document.getElementById('evPos').value = v.pos || '';
  document.getElementById('evLevel').value = v.level || 'A2';
  document.getElementById('evCategory').value = v.category || '';
  document.getElementById('evMeaning').value = v.meaning;
  document.getElementById('evExample').value = v.example || '';
  document.getElementById('evMsg').className = 'form-msg';
  document.getElementById('evMsg').textContent = '';
  document.getElementById('editVocabModal').classList.add('show');
}

function closeEditVocabModal(){
  currentEditVocabId = null;
  document.getElementById('editVocabModal').classList.remove('show');
}

document.getElementById('evCancelBtn').addEventListener('click', closeEditVocabModal);
document.getElementById('editVocabModal').addEventListener('click', (e) => {
  if(e.target.id === 'editVocabModal') closeEditVocabModal();
});

document.getElementById('evSaveBtn').addEventListener('click', async () => {
  if(!currentEditVocabId) return;
  const word = document.getElementById('evWord').value.trim();
  const ipa = document.getElementById('evIpa').value.trim();
  const pos = document.getElementById('evPos').value.trim();
  const level = document.getElementById('evLevel').value;
  const category = document.getElementById('evCategory').value.trim();
  const meaning = document.getElementById('evMeaning').value.trim();
  const example = document.getElementById('evExample').value.trim();
  const msg = document.getElementById('evMsg');

  if(!word || !meaning){
    msg.textContent = 'Isi kata dan arti dulu ya.';
    msg.className = 'form-msg err';
    return;
  }

  const saveBtn = document.getElementById('evSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  const { error } = await sb.from('vocabulary').update({
    word, ipa: ipa || null, pos: pos || null, level, category: category || null,
    meaning, example: example || null
  }).eq('id', currentEditVocabId);

  saveBtn.disabled = false;
  saveBtn.textContent = 'Simpan Perubahan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  const idx = allVocab.findIndex(x => x.id === currentEditVocabId);
  if(idx > -1) allVocab[idx] = { ...allVocab[idx], word, ipa, pos, level, category, meaning, example };
  renderVocabTable();
  closeEditVocabModal();
});

