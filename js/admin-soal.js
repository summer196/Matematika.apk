/* ============================================================
   ADMIN-SOAL.JS — tab 'Kelola Soal' (custom_questions CRUD).
   Butuh admin-core.js dimuat sebelum ini.
   ============================================================ */

/* ---------------- Data ---------------- */
async function loadQuestions(){
  if(!sb){
    document.getElementById('tableWrap').innerHTML = `<div class="empty-state">Supabase belum dikonfigurasi di supabase-config.js.</div>`;
    return;
  }
  const { data, error } = await sb.from('custom_questions').select('*').order('created_at', {ascending:false});
  if(error){
    document.getElementById('tableWrap').innerHTML = `<div class="empty-state">Gagal memuat soal: ${escapeHtml(error.message)}</div>`;
    return;
  }
  allQuestions = data || [];
  renderStats();
  renderTable();
}

function renderStats(){
  document.getElementById('statTotal').textContent = allQuestions.length;
  document.getElementById('statActive').textContent = allQuestions.filter(q => q.is_active).length;
  document.getElementById('statInactive').textContent = allQuestions.filter(q => !q.is_active).length;
}

function renderTable(){
  const wrap = document.getElementById('tableWrap');
  const filtered = currentFilter === 'semua' ? allQuestions : allQuestions.filter(q => q.operation === currentFilter);
  if(filtered.length === 0){
    wrap.innerHTML = `<div class="empty-state">Belum ada soal pada kategori ini. Tambahkan melalui formulir di atas.</div>`;
    return;
  }
  const rows = filtered.map(q => `
    <tr data-id="${q.id}">
      <td data-label="Kategori"><span class="op-pill ${q.operation}">${OP_LABEL[q.operation] || q.operation}</span></td>
      <td data-label="Soal">${escapeHtml(q.question_text)}</td>
      <td data-label="Jawaban"><b>${escapeHtml(String(q.answer))}</b></td>
      <td data-label="Aksi">
        <div class="row-actions">
          <button class="btn-edit" data-action="edit" data-id="${q.id}">Koreksi</button>
          <button class="btn-toggle ${q.is_active ? 'is-active':''}" data-action="toggle" data-id="${q.id}">${q.is_active ? 'Aktif':'Nonaktif'}</button>
          <button class="btn-delete" data-action="delete" data-id="${q.id}">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Kategori</th><th>Soal</th><th>Jawaban</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', () => toggleActive(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteQuestion(btn.dataset.id));
  });
}

async function toggleActive(id){
  const q = allQuestions.find(x => x.id === id);
  if(!q) return;
  const { error } = await sb.from('custom_questions').update({ is_active: !q.is_active }).eq('id', id);
  if(error){ alert('Gagal ubah status: ' + error.message); return; }
  q.is_active = !q.is_active;
  renderStats();
  renderTable();
}

async function deleteQuestion(id){
  if(!confirm('Yakin ingin menghapus soal ini?')) return;
  const { error } = await sb.from('custom_questions').delete().eq('id', id);
  if(error){ alert('Gagal hapus: ' + error.message); return; }
  allQuestions = allQuestions.filter(x => x.id !== id);
  renderStats();
  renderTable();
}

document.getElementById('filterRow').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if(!btn) return;
  document.querySelectorAll('#filterRow button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderTable();
});

/* ---------------- Kosongkan semua soal ---------------- */
document.getElementById('resetAllBtn').addEventListener('click', async () => {
  if(allQuestions.length === 0){
    alert('Belum ada soal untuk dihapus.');
    return;
  }
  const step1 = confirm(`Yakin ingin menghapus SEMUA ${allQuestions.length} soal khusus? Soal otomatis tidak terpengaruh, hanya soal yang ditambahkan secara manual yang akan terhapus.`);
  if(!step1) return;
  const typed = prompt('Buat konfirmasi, ketik HAPUS (huruf besar semua):');
  if(typed !== 'HAPUS'){
    alert('Dibatalkan, soal tidak dihapus.');
    return;
  }
  const btn = document.getElementById('resetAllBtn');
  btn.disabled = true;
  btn.textContent = 'Menghapus...';
  const { error } = await sb.from('custom_questions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  btn.disabled = false;
  btn.textContent = 'Kosongkan Semua Soal';
  if(error){
    alert('Gagal hapus semua: ' + error.message);
    return;
  }
  allQuestions = [];
  renderStats();
  renderTable();
  alert('Seluruh soal khusus telah dikosongkan.');
});

/* ---------------- Tambah soal baru ---------------- */
document.getElementById('submitBtn').addEventListener('click', async () => {
  const operation = document.getElementById('fOperation').value;
  const answer = document.getElementById('fAnswer').value.trim();
  const question_text = document.getElementById('fQuestion').value.trim();
  const note = document.getElementById('fNote').value.trim();
  const msg = document.getElementById('formMsg');

  if(!question_text || answer === '' || isNaN(Number(answer))){
    msg.textContent = 'Isi teks soal dan jawaban (angka) dulu ya.';
    msg.className = 'form-msg err';
    return;
  }
  if(!sb){
    msg.textContent = 'Supabase belum dikonfigurasi.';
    msg.className = 'form-msg err';
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('custom_questions').insert([{
    operation, question_text, answer: Number(answer), note: note || null, is_active: true
  }]).select();

  submitBtn.disabled = false;
  submitBtn.textContent = 'Simpan Soal';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  msg.textContent = 'Soal tersimpan dan langsung muncul pada aplikasi bidadari.';
  msg.className = 'form-msg ok';
  document.getElementById('fQuestion').value = '';
  document.getElementById('fAnswer').value = '';
  document.getElementById('fNote').value = '';

  if(data && data[0]) allQuestions.unshift(data[0]);
  renderStats();
  renderTable();
});

/* ---------------- Fitur Koreksi (edit soal via modal) ---------------- */
function openEditModal(id){
  const q = allQuestions.find(x => x.id === id);
  if(!q) return;
  currentEditId = id;
  document.getElementById('eOperation').value = q.operation;
  document.getElementById('eQuestion').value = q.question_text;
  document.getElementById('eAnswer').value = q.answer;
  document.getElementById('eNote').value = q.note || '';
  document.getElementById('editMsg').className = 'form-msg';
  document.getElementById('editMsg').textContent = '';
  document.getElementById('editModal').classList.add('show');
}

function closeEditModal(){
  currentEditId = null;
  document.getElementById('editModal').classList.remove('show');
}

document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', (e) => {
  if(e.target.id === 'editModal') closeEditModal();
});

document.getElementById('editSaveBtn').addEventListener('click', async () => {
  if(!currentEditId) return;
  const operation = document.getElementById('eOperation').value;
  const answer = document.getElementById('eAnswer').value.trim();
  const question_text = document.getElementById('eQuestion').value.trim();
  const note = document.getElementById('eNote').value.trim();
  const msg = document.getElementById('editMsg');

  if(!question_text || answer === '' || isNaN(Number(answer))){
    msg.textContent = 'Isi teks soal dan jawaban (angka) dulu ya.';
    msg.className = 'form-msg err';
    return;
  }

  const saveBtn = document.getElementById('editSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';

  const { data, error } = await sb.from('custom_questions')
    .update({ operation, question_text, answer: Number(answer), note: note || null })
    .eq('id', currentEditId)
    .select();

  saveBtn.disabled = false;
  saveBtn.textContent = 'Simpan Perubahan';

  if(error){
    msg.textContent = 'Gagal simpan: ' + error.message;
    msg.className = 'form-msg err';
    return;
  }

  const idx = allQuestions.findIndex(x => x.id === currentEditId);
  if(idx !== -1 && data && data[0]) allQuestions[idx] = data[0];
  renderStats();
  renderTable();
  closeEditModal();
});

