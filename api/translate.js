// ============================================================
// /api/translate — Vercel Serverless Function
// Proxy ke MyMemory Translation API (gratis, gak butuh API key).
// Dipake dashboard admin buat auto-translate pas nambah soal
// latihan terjemahan. Ditaruh di server biar gampang diganti ke
// provider lain (yang butuh API key) tanpa ubah kode di frontend.
// ============================================================

export default async function handler(req, res) {
  const { text, source, target } = req.query;

  if (!text || !source || !target) {
    res.status(400).json({ error: 'Parameter text, source, dan target wajib diisi.' });
    return;
  }

  try {
    const langpair = `${source}|${target}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    const r = await fetch(url);
    if (!r.ok) {
      res.status(502).json({ error: 'Gagal menghubungi MyMemory.' });
      return;
    }
    const data = await r.json();
    const translation = data && data.responseData ? data.responseData.translatedText : null;

    if (!translation) {
      res.status(502).json({ error: 'MyMemory tidak mengembalikan hasil terjemahan.' });
      return;
    }

    res.status(200).json({ translation });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan saat menerjemahkan: ' + e.message });
  }
}
