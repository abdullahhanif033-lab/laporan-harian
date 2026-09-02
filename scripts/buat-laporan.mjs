// =====================================================================
//  Pembuat briefing harian — versi mandiri (tanpa n8n)
//  Dijalankan oleh GitHub Actions tiap 06.00 WIB, juga bisa dijalankan
//  manual di laptop:  node scripts/buat-laporan.mjs
//
//  Perlu variabel lingkungan GEMINI_API_KEY.
// =====================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER_LAPORAN = join(AKAR, 'harian');
// Daftar model yang dicoba berurutan. Kalau Google menghentikan salah satunya,
// skrip otomatis pindah ke berikutnya — termasuk ke model pengganti yang
// disebut Google sendiri di pesan errornya.
const MODEL_PILIHAN = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash'
].filter(Boolean);

/* ---------------------------------------------------------------- utilitas */

function uang(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + ' triliun';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + ' miliar';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + ' juta';
  return '$' + n;
}

function bersih(t) {
  return String(t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function ambil(url, { sebagai = 'json', timeoutMs = 25000 } = {}) {
  const kontrol = new AbortController();
  const jam = setTimeout(() => kontrol.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: kontrol.signal,
      headers: { 'user-agent': 'laporan-harian-bot/1.0 (+github-actions)' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return sebagai === 'json' ? await res.json() : await res.text();
  } finally {
    clearTimeout(jam);
  }
}

// Pembaca RSS sederhana: cukup untuk judul + ringkasan, tanpa pustaka luar.
function bacaRss(xml, batas = 12) {
  const butir = [];
  const cocok = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of cocok.slice(0, batas)) {
    const judul = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const isi =
      (b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ||
      (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] ||
      '';
    const lepas = (s) =>
      bersih(s)
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
    if (judul) butir.push({ judul: lepas(judul), isi: lepas(isi).slice(0, 180) });
  }
  return butir;
}

function daftarBerita(butir, kosong) {
  if (!butir.length) return kosong;
  return butir.map((b, i) => `${i + 1}. ${b.judul}${b.isi ? ' — ' + b.isi : ''}`).join('\n');
}

/* ----------------------------------------------------- pengambilan sumber */

async function ambilSemua() {
  const hasil = {};

  const tugas = [
    ['harga', async () => {
      const d = await ambil(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc' +
        '&per_page=15&page=1&price_change_percentage=24h'
      );
      return d.map(c => {
        const ubah = c.price_change_percentage_24h == null ? 'n/a' : c.price_change_percentage_24h.toFixed(2) + '%';
        return `${String(c.symbol).toUpperCase()} (${c.name}): harga $${c.current_price}` +
               ` | 24 jam: ${ubah} | kapitalisasi pasar: ${uang(c.market_cap)}`;
      }).join('\n');
    }],
    ['global', async () => {
      const g = (await ambil('https://api.coingecko.com/api/v3/global')).data;
      return `Total kapitalisasi pasar: ${uang(g.total_market_cap.usd)}` +
             ` | Perubahan 24 jam: ${g.market_cap_change_percentage_24h_usd?.toFixed(2) ?? 'n/a'}%` +
             ` | Dominasi BTC: ${g.market_cap_percentage.btc.toFixed(1)}%` +
             ` | Dominasi ETH: ${g.market_cap_percentage.eth.toFixed(1)}%`;
    }],
    ['sentimen', async () => {
      const f = (await ambil('https://api.alternative.me/fng/?limit=2')).data;
      return f.map(d => `${d.value} (${d.value_classification})`).join(' | sebelumnya: ');
    }],
    ['beritaCrypto', async () => {
      const xml = await ambil('https://cointelegraph.com/rss', { sebagai: 'teks' });
      return daftarBerita(bacaRss(xml, 12), 'Tidak ada berita crypto terambil.');
    }],
    ['beritaDunia', async () => {
      const xml = await ambil('https://feeds.bbci.co.uk/news/world/rss.xml', { sebagai: 'teks' });
      return daftarBerita(bacaRss(xml, 10), 'Tidak ada berita dunia terambil.');
    }]
  ];

  await Promise.all(tugas.map(async ([nama, fn]) => {
    try {
      hasil[nama] = await fn();
      console.log(`  [ok]    ${nama}`);
    } catch (e) {
      hasil[nama] = `DATA TIDAK TERSEDIA (${e.message})`;
      console.log(`  [gagal] ${nama}: ${e.message}`);
    }
  }));

  return hasil;
}

/* --------------------------------------------------------------- waktu WIB */

function waktuWib() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  const namaBulan = ['Januari','Februari','Maret','April','Mei','Juni',
                     'Juli','Agustus','September','Oktober','November','Desember'];
  return {
    tanggal: wib.toISOString().slice(0, 10),
    tanggalPanjang: `${wib.getUTCDate()} ${namaBulan[wib.getUTCMonth()]} ${wib.getUTCFullYear()}`,
    jam: String(wib.getUTCHours()).padStart(2, '0') + ':' + String(wib.getUTCMinutes()).padStart(2, '0')
  };
}

/* ------------------------------------------------------------------ prompt */

function susunPrompt(data, waktu) {
  return [
'Kamu analis pasar keuangan yang menulis briefing harian dalam Bahasa Indonesia untuk investor ritel yang serius.',
'',
'Tulis laporan dalam format markdown dengan struktur persis seperti ini:',
'',
`# Briefing Harian — ${waktu.tanggalPanjang}`,
'',
`Disusun otomatis ${waktu.jam} WIB | Sumber: CoinGecko, Alternative.me, Cointelegraph, BBC World`,
'',
'## Ringkasan Pagi Ini',
'(3-5 kalimat: hal terpenting yang terjadi, arah pasar, nada keseluruhan hari ini)',
'',
'## Pasar Crypto',
'(Buat tabel markdown 8 koin teratas dengan kolom: Aset | Harga | 24 Jam | Kapitalisasi Pasar. Salin nilai kapitalisasi persis seperti tertulis di data, termasuk kata "miliar" atau "triliun". Lalu 2-3 paragraf membaca kondisinya: siapa naik dan turun paling tajam, arah dominasi BTC, dan arti angka Fear & Greed hari ini dibanding kemarin.)',
'',
'## Berita & Kebijakan Penting',
'(3-6 poin bullet dari berita di bawah yang benar-benar berdampak. Tiap poin 1-2 kalimat plus kenapa itu penting. Abaikan berita remeh, gosip, dan iklan.)',
'',
'## Agenda yang Perlu Diperhatikan',
'(Daftar peristiwa mendatang yang relevan: rapat bank sentral, rilis data ekonomi, unlock token besar, tenggat regulasi. Kalau kamu tidak punya kepastian tanggal dari data, tandai dengan "(perkiraan)".)',
'',
'## Catatan Hari Ini',
'(2-4 kalimat penutup: apa yang layak diperhatikan dan risiko yang mengintai. Jujur — kalau pasar sepi, katakan sepi.)',
'',
'ATURAN KETAT:',
'- Jangan mengarang angka. Hanya gunakan angka dari DATA di bawah.',
'- Satuan uang harus disalin apa adanya dari data (miliar/triliun). Jangan mengubah atau menyingkatnya.',
'- Kalau ada data yang tertulis TIDAK TERSEDIA, tulis apa adanya bahwa data itu tidak masuk hari ini. Jangan menebak.',
'- Bahasa Indonesia yang mengalir dan langsung ke inti, bukan bahasa robot atau terjemahan kaku.',
'- Jangan memberi rekomendasi beli/jual. Ini laporan situasi, bukan nasihat investasi.',
'- Keluarkan HANYA isi markdown laporannya. Tanpa kalimat pembuka, tanpa penutup, tanpa pagar kode.',
'',
`=== DATA HARI INI (${waktu.tanggalPanjang}) ===`,
'',
'[HARGA 15 KOIN TERATAS]',
data.harga,
'',
'[PASAR GLOBAL CRYPTO]',
data.global,
'',
'[INDEKS FEAR & GREED — hari ini | kemarin]',
data.sentimen,
'',
'[BERITA CRYPTO 24 JAM TERAKHIR]',
data.beritaCrypto,
'',
'[BERITA DUNIA 24 JAM TERAKHIR]',
data.beritaDunia
  ].join('\n');
}

/* ------------------------------------------------------------------ gemini */

async function panggilGemini(model, prompt, kunci) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': kunci },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
    })
  });

  const badan = await res.text();
  if (!res.ok) {
    const galat = new Error(`HTTP ${res.status}: ${badan.slice(0, 300)}`);
    galat.status = res.status;
    // Google biasanya menyebut model penggantinya di pesan error.
    const usul = badan.match(/models\/([a-z0-9.\-]+)\s+for the latest/i);
    galat.modelUsulan = usul ? usul[1] : null;
    throw galat;
  }

  const data = JSON.parse(badan);
  const bagian = data?.candidates?.[0]?.content?.parts;
  const teks = Array.isArray(bagian) ? bagian.map(p => p.text || '').join('') : '';
  if (!teks.trim()) throw new Error('Gemini mengembalikan jawaban kosong');
  return teks;
}

async function tanyaGemini(prompt, kunci) {
  const dicoba = [];
  const antrean = [...MODEL_PILIHAN];

  while (antrean.length) {
    const model = antrean.shift();
    if (dicoba.includes(model)) continue;
    dicoba.push(model);

    try {
      console.log(`  mencoba model ${model}...`);
      const teks = await panggilGemini(model, prompt, kunci);
      console.log(`  [ok] model ${model} dipakai`);
      return teks;
    } catch (e) {
      console.log(`  [gagal] ${model} — ${e.message.slice(0, 120)}`);
      if (e.status === 404 && e.modelUsulan && !dicoba.includes(e.modelUsulan)) {
        console.log(`  Google menyarankan ${e.modelUsulan}, dicoba berikutnya.`);
        antrean.unshift(e.modelUsulan);
      }
      // Kunci salah atau kuota habis: tidak ada gunanya coba model lain.
      if (e.status === 400 || e.status === 401 || e.status === 403 || e.status === 429) {
        throw new Error(`Gemini menolak (${e.message.slice(0, 200)})`);
      }
    }
  }

  throw new Error(`Semua model gagal dicoba: ${dicoba.join(', ')}`);
}

/* -------------------------------------------------------------------- main */

async function utama() {
  const kunci = process.env.GEMINI_API_KEY;
  if (!kunci) {
    console.error('GAGAL: variabel GEMINI_API_KEY belum diisi.');
    process.exit(1);
  }

  const waktu = waktuWib();
  console.log(`Menyusun briefing untuk ${waktu.tanggalPanjang} (${waktu.jam} WIB)`);

  console.log('Mengambil data...');
  const data = await ambilSemua();

  console.log('Meminta Gemini menulis laporan...');
  let isi = (await tanyaGemini(susunPrompt(data, waktu), kunci)).trim();
  isi = isi.replace(/^```(markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();

  const catatan = `<!-- Dibuat otomatis oleh GitHub Actions pada ${waktu.tanggal} ${waktu.jam} WIB -->`;
  const laporan = `${catatan}\n\n${isi}\n`;

  await mkdir(FOLDER_LAPORAN, { recursive: true });
  const berkasHarian = join(FOLDER_LAPORAN, `${waktu.tanggal}-briefing.md`);
  await writeFile(berkasHarian, laporan, 'utf8');
  await writeFile(join(FOLDER_LAPORAN, 'terbaru.md'), laporan, 'utf8');

  console.log(`Selesai. ${laporan.length} karakter ditulis ke:`);
  console.log(`  ${berkasHarian}`);
  console.log(`  ${join(FOLDER_LAPORAN, 'terbaru.md')}`);
}

utama().catch(e => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
