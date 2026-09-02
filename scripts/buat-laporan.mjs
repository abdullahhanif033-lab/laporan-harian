// =====================================================================
//  Pembuat briefing harian — versi mandiri (tanpa n8n)
//  Dijalankan GitHub Actions tiap 06.00 WIB, bisa juga dijalankan
//  manual:  node scripts/buat-laporan.mjs
//
//  Perlu variabel lingkungan GEMINI_API_KEY.
//
//  Cara berpikirnya mengikuti skill "analis-aset" milik user:
//  jantung dulu baru aliran darah, jangan pernah mengarang angka,
//  pisahkan fakta / interpretasi / spekulasi, dan wajib ada sisi lain.
// =====================================================================

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kartuMetrik, grafikTren, grafikPerubahan, grafikSentimen,
  angka, uangRingkas, persen, WARNA
} from './grafik.mjs';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER_LAPORAN = join(AKAR, 'harian');
const FOLDER_ASET = join(FOLDER_LAPORAN, 'aset');

const MODEL_PILIHAN = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash'
].filter(Boolean);

/* ---------------------------------------------------------------- utilitas */

function bersih(t) {
  return String(t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function lepasEntitas(s) {
  return bersih(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
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

function bacaRss(xml, batas = 12) {
  const butir = [];
  const cocok = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const b of cocok.slice(0, batas)) {
    const judul = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const isi =
      (b.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ||
      (b.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || '';
    if (judul) butir.push({ judul: lepasEntitas(judul), isi: lepasEntitas(isi).slice(0, 180) });
  }
  return butir;
}

function daftarBerita(butir, kosong) {
  if (!butir?.length) return kosong;
  return butir.map((b, i) => `${i + 1}. ${b.judul}${b.isi ? ' — ' + b.isi : ''}`).join('\n');
}

/* ----------------------------------------------------- pengambilan sumber */

async function ambilSemua() {
  const mentah = {};
  const teks = {};

  const tugas = [
    ['koin', async () => {
      const d = await ambil(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc' +
        '&per_page=15&page=1&price_change_percentage=24h'
      );
      mentah.koin = d;
      teks.harga = d.map(c => {
        const ubah = c.price_change_percentage_24h == null ? 'tidak tersedia' : persen(c.price_change_percentage_24h);
        return `${String(c.symbol).toUpperCase()} (${c.name}): harga $${angka(c.current_price)}` +
               ` | 24 jam: ${ubah} | kapitalisasi pasar: ${uangRingkas(c.market_cap)}` +
               ` | volume 24 jam: ${uangRingkas(c.total_volume)}`;
      }).join('\n');
    }],

    ['global', async () => {
      const g = (await ambil('https://api.coingecko.com/api/v3/global')).data;
      mentah.global = g;
      teks.global =
        `Total kapitalisasi pasar: ${uangRingkas(g.total_market_cap.usd)}` +
        ` | Perubahan 24 jam: ${g.market_cap_change_percentage_24h_usd == null ? 'tidak tersedia' : persen(g.market_cap_change_percentage_24h_usd)}` +
        ` | Volume 24 jam: ${uangRingkas(g.total_volume.usd)}` +
        ` | Dominasi BTC: ${angka(g.market_cap_percentage.btc, 1)}%` +
        ` | Dominasi ETH: ${angka(g.market_cap_percentage.eth, 1)}%`;
    }],

    ['sentimen', async () => {
      const f = (await ambil('https://api.alternative.me/fng/?limit=30')).data;
      mentah.sentimen = f;
      const hariIni = f[0], kemarin = f[1], pekanLalu = f[7];
      teks.sentimen =
        `Hari ini: ${hariIni.value} (${hariIni.value_classification})` +
        ` | Kemarin: ${kemarin ? kemarin.value + ' (' + kemarin.value_classification + ')' : 'tidak tersedia'}` +
        ` | Sepekan lalu: ${pekanLalu ? pekanLalu.value + ' (' + pekanLalu.value_classification + ')' : 'tidak tersedia'}`;
    }],

    ['btc7hari', async () => {
      const d = await ambil('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=daily');
      mentah.btc7hari = d.prices;
      const awal = d.prices[0][1], akhir = d.prices[d.prices.length - 1][1];
      const ubah = ((akhir - awal) / awal) * 100;
      teks.btc7hari =
        `Bitcoin 7 hari: dari $${angka(awal, 0)} ke $${angka(akhir, 0)} (${persen(ubah)})` +
        ` | Tertinggi: $${angka(Math.max(...d.prices.map(p => p[1])), 0)}` +
        ` | Terendah: $${angka(Math.min(...d.prices.map(p => p[1])), 0)}` +
        ` — hitungan saya sendiri dari deret harga harian CoinGecko`;
    }],

    ['tren', async () => {
      const d = await ambil('https://api.coingecko.com/api/v3/search/trending');
      mentah.tren = d.coins;
      teks.tren = d.coins.slice(0, 7).map((c, i) =>
        `${i + 1}. ${c.item.name} (${c.item.symbol}) — peringkat kapitalisasi #${c.item.market_cap_rank ?? 'tidak tersedia'}`
      ).join('\n');
    }],

    ['beritaCrypto', async () => {
      const xml = await ambil('https://cointelegraph.com/rss', { sebagai: 'teks' });
      teks.beritaCrypto = daftarBerita(bacaRss(xml, 12), 'Tidak ada berita crypto terambil.');
    }],

    ['beritaDunia', async () => {
      const xml = await ambil('https://feeds.bbci.co.uk/news/world/rss.xml', { sebagai: 'teks' });
      teks.beritaDunia = daftarBerita(bacaRss(xml, 10), 'Tidak ada berita dunia terambil.');
    }],

    ['percakapan', async () => {
      // Pengganti gratis untuk "apa yang sedang ramai dibicarakan".
      // Reddit memblokir endpoint JSON dari IP pusat data, tapi RSS-nya lolos.
      const xml = await ambil('https://www.reddit.com/r/CryptoCurrency/hot/.rss?limit=15', { sebagai: 'teks' });
      const butir = bacaRss(xml, 12).filter(b => !/^Daily (Discussion|General)/i.test(b.judul));
      teks.percakapan = butir.length
        ? butir.slice(0, 10).map((b, i) => `${i + 1}. ${b.judul}`).join('\n')
        : 'Tidak ada percakapan terambil.';
    }],

    ['sorotan', async () => {
      // CryptoPanic mengumpulkan berita yang paling banyak direaksikan komunitas.
      const xml = await ambil('https://cryptopanic.com/news/rss/', { sebagai: 'teks' });
      teks.sorotan = daftarBerita(bacaRss(xml, 12), 'Tidak ada sorotan terambil.');
    }]
  ];

  await Promise.all(tugas.map(async ([nama, fn]) => {
    try {
      await fn();
      console.log(`  [ok]    ${nama}`);
    } catch (e) {
      const pesan = `DATA TIDAK TERSEDIA (${e.message})`;
      if (nama === 'koin') teks.harga = pesan;
      else teks[nama] = pesan;
      console.log(`  [gagal] ${nama}: ${e.message}`);
    }
  }));

  return { mentah, teks };
}

/* --------------------------------------------------------------- grafik */

async function buatGrafik(mentah, waktu) {
  await mkdir(FOLDER_ASET, { recursive: true });
  const dibuat = {};

  const simpan = async (kunci, namaPendek, svg) => {
    const nama = `${waktu.tanggal}-${namaPendek}.svg`;
    await writeFile(join(FOLDER_ASET, nama), svg, 'utf8');
    dibuat[kunci] = { nama, svg };
    console.log(`  [grafik] aset/${nama}`);
  };

  // 1 — Kartu metrik utama
  if (mentah.koin && mentah.global) {
    const btc = mentah.koin.find(c => c.symbol === 'btc');
    const eth = mentah.koin.find(c => c.symbol === 'eth');
    const fng = mentah.sentimen?.[0];
    const fngKemarin = mentah.sentimen?.[1];

    await simpan('kpi', 'kartu-metrik', kartuMetrik([
      { label: 'Bitcoin', nilai: '$' + angka(btc?.current_price, 0), ubah: btc?.price_change_percentage_24h, warna: WARNA.violet },
      { label: 'Ethereum', nilai: '$' + angka(eth?.current_price, 0), ubah: eth?.price_change_percentage_24h, warna: WARNA.teal },
      { label: 'Kapitalisasi pasar', nilai: uangRingkas(mentah.global.total_market_cap.usd), ubah: mentah.global.market_cap_change_percentage_24h_usd, warna: WARNA.amber },
      {
        label: 'Fear & Greed',
        nilai: fng ? `${fng.value} · ${fng.value_classification}` : 'n/a',
        ubah: fng && fngKemarin ? Number(fng.value) - Number(fngKemarin.value) : null,
        catatan: fngKemarin ? `kemarin ${fngKemarin.value}` : '',
        warna: WARNA.pink
      }
    ]));
  }

  // 2 — Tren Bitcoin 7 hari
  if (mentah.btc7hari?.length) {
    const hari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const titik = mentah.btc7hari.map(([ms, harga]) => {
      const d = new Date(ms + 7 * 3600 * 1000);
      return { label: `${hari[d.getUTCDay()]} ${d.getUTCDate()}`, nilai: harga };
    });
    await simpan('btc7hari', 'bitcoin-7-hari', grafikTren(titik, { judul: 'Bitcoin — 7 hari terakhir (USD)' }));
  }

  // 3 — Perubahan 24 jam koin utama
  if (mentah.koin?.length) {
    const baris = mentah.koin
      .filter(c => !['usdt', 'usdc', 'dai', 'usde', 'fdusd'].includes(c.symbol))
      .slice(0, 10)
      .map(c => ({
        label: String(c.symbol).toUpperCase(),
        nilai: c.price_change_percentage_24h,
        catatan: uangRingkas(c.market_cap)
      }));
    await simpan('ubah24j', 'perubahan-24-jam', grafikPerubahan(baris, {
      judul: 'Perubahan 24 jam — koin utama (stablecoin dikecualikan)'
    }));
  }

  // 4 — Sentimen 30 hari
  if (mentah.sentimen?.length) {
    const titik = [...mentah.sentimen].reverse().map(d => {
      const t = new Date(Number(d.timestamp) * 1000);
      return { label: `${t.getUTCDate()}/${t.getUTCMonth() + 1}`, nilai: Number(d.value) };
    });
    await simpan('sentimen', 'sentimen-30-hari', grafikSentimen(titik, {
      judul: 'Indeks Fear & Greed — 30 hari terakhir'
    }));
  }

  return dibuat;
}

/* --------------------------------------------------------------- waktu */

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

function susunPrompt(teks, waktu) {
  return `Kamu analis pasar yang menulis briefing harian Bahasa Indonesia untuk investor ritel serius.
Tugasmu bukan memberi rekomendasi, tapi menyusun dossier keputusan: fakta terverifikasi,
pembacaan yang jujur, dan argumen lawannya.

CARA BERPIKIR (wajib diikuti):
1. Jantung dulu. Tentukan SATU hal yang paling menentukan arah pasar hari ini, lalu jadikan
   itu tulang punggung laporan. Jangan menyusun daftar angka tanpa urutan kepentingan.
2. Pisahkan tiga lapis secara eksplisit: FAKTA (angka + sumbernya) → INTERPRETASI (artinya)
   → SPEKULASI (skenario; wajib ditandai dengan kata "spekulasi" atau "kalau ... maka ...").
3. Jangan pernah mengarang angka. Yang tidak ada di DATA ditulis "tidak tersedia".
   Analisis dengan 5 angka nyata lebih berguna daripada 12 angka yang separuhnya ditebak.
4. Wajib ada sisi lain. Tulis argumen yang melawan pembacaan utamamu seserius pembacaan
   utamanya. Sisi lain yang terasa asal-asalan berarti bacaannya belum selesai.
5. Tandai hitunganmu sendiri. Contoh: "sekitar 12% di bawah puncak pekan ini — hitungan saya
   dari data harga di bawah, bukan angka publikasi."
6. Bukan penasihat keuangan. Jangan pernah menulis "beli" atau "jual" sebagai perintah.

STRUKTUR (pakai judul persis seperti ini):

# Briefing Harian — ${waktu.tanggalPanjang}

Disusun otomatis ${waktu.jam} WIB | Sumber: CoinGecko, Alternative.me, Cointelegraph, BBC World, Reddit, CryptoPanic

## Yang Paling Penting Hari Ini
(Judul-sebagai-temuan tidak dipakai di sini; langsung 3-5 kalimat. Sebut satu hal yang paling
menentukan hari ini beserta angkanya, lalu kenapa itu yang dipilih, bukan yang lain.)

## Pasar Crypto
(Tabel markdown 8 koin teratas: Aset | Harga | 24 Jam | Kapitalisasi Pasar. Salin angka persis
dari DATA. Lalu 2-3 paragraf: siapa bergerak paling tajam dan kemungkinan sebabnya, ke mana
arah dominasi BTC dan apa artinya untuk altcoin, serta bacaan volume.)

## Sentimen Pasar
(2-3 paragraf membaca indeks Fear & Greed hari ini dibanding kemarin dan sepekan lalu, lalu
kaitkan dengan pergerakan harga 7 hari. Sebut kalau sentimen dan harga bergerak berlawanan —
itu justru sinyal yang menarik.)

## Berita & Kebijakan Penting
(3-6 poin bullet dari berita di DATA yang benar-benar berdampak. Tiap poin: 1-2 kalimat isi,
lalu satu kalimat "Kenapa penting:". Abaikan gosip, iklan, dan berita harga harian.)

## Yang Sedang Ramai Dibicarakan
(2-4 kalimat dari data koin trending, percakapan Reddit, dan sorotan komunitas. Perlakukan ini
sebagai indikator perhatian ritel, BUKAN indikator kualitas aset — katakan itu secara eksplisit.)

## Sisi Lain
(2-4 kalimat. Argumen yang melawan pembacaan utama di bagian pertama. Kalau pembacaanmu
bullish, tulis alasan kuat kenapa bisa salah, dan sebaliknya.)

## Agenda yang Perlu Diperhatikan
(Daftar peristiwa mendatang yang relevan: rapat bank sentral, rilis data ekonomi, unlock token,
tenggat regulasi. Tandai "(perkiraan)" kalau tanggalnya tidak dipastikan oleh DATA.)

## Catatan & Batas Laporan Ini
(2-3 kalimat: data apa yang tidak tersedia hari ini, dan apa yang laporan ini TIDAK bisa jawab.
Tutup dengan: "Laporan ini menyajikan situasi, bukan nasihat investasi.")

ATURAN PENULISAN:
- Bahasa Indonesia yang mengalir, langsung ke inti, bukan terjemahan kaku.
- Satuan uang disalin apa adanya dari DATA (T = triliun, M = miliar, jt = juta).
- Keluarkan HANYA isi markdown laporannya. Tanpa pembuka, tanpa penutup, tanpa pagar kode.
- Jangan menyisipkan gambar atau tautan gambar; grafik ditambahkan otomatis setelah kamu selesai.

=== DATA HARI INI (${waktu.tanggalPanjang} ${waktu.jam} WIB) ===

[HARGA 15 KOIN TERATAS — CoinGecko]
${teks.harga ?? 'tidak tersedia'}

[PASAR GLOBAL CRYPTO — CoinGecko]
${teks.global ?? 'tidak tersedia'}

[PERGERAKAN BITCOIN 7 HARI — CoinGecko]
${teks.btc7hari ?? 'tidak tersedia'}

[INDEKS FEAR & GREED — Alternative.me]
${teks.sentimen ?? 'tidak tersedia'}

[KOIN TRENDING — CoinGecko]
${teks.tren ?? 'tidak tersedia'}

[BERITA CRYPTO 24 JAM — Cointelegraph]
${teks.beritaCrypto ?? 'tidak tersedia'}

[BERITA DUNIA 24 JAM — BBC World]
${teks.beritaDunia ?? 'tidak tersedia'}

[PERCAKAPAN RITEL — Reddit r/CryptoCurrency]
${teks.percakapan ?? 'tidak tersedia'}

[SOROTAN KOMUNITAS — CryptoPanic]
${teks.sorotan ?? 'tidak tersedia'}
`;
}

/* ------------------------------------------------------------------ gemini */

async function panggilGemini(model, prompt, kunci) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': kunci },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 16384 }
    })
  });

  const badan = await res.text();
  if (!res.ok) {
    const galat = new Error(`HTTP ${res.status}: ${badan.slice(0, 300)}`);
    galat.status = res.status;
    const usul = badan.match(/models\/([a-z0-9.\-]+)\s+for the latest/i);
    galat.modelUsulan = usul ? usul[1] : null;
    throw galat;
  }

  const data = JSON.parse(badan);
  const kandidat = data?.candidates?.[0];
  const bagian = kandidat?.content?.parts;
  const teks = Array.isArray(bagian) ? bagian.map(p => p.text || '').join('') : '';
  if (!teks.trim()) throw new Error('Gemini mengembalikan jawaban kosong');
  if (kandidat?.finishReason && kandidat.finishReason !== 'STOP') {
    console.log(`  [peringatan] jawaban berhenti karena ${kandidat.finishReason} — laporan mungkin terpotong`);
  }
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
      if ([400, 401, 403, 429].includes(e.status)) {
        throw new Error(`Gemini menolak (${e.message.slice(0, 200)})`);
      }
    }
  }
  throw new Error(`Semua model gagal dicoba: ${dicoba.join(', ')}`);
}

/* ------------------------------------------------- penyisipan grafik ke md */

function sisipkanGrafik(md, grafik) {
  const tempat = [
    ['## Pasar Crypto', ['kpi', 'ubah24j']],
    ['## Sentimen Pasar', ['sentimen', 'btc7hari']]
  ];

  let hasil = md;
  for (const [judul, kunci] of tempat) {
    const gambar = kunci
      .filter(k => grafik[k])
      .map(k => `\n![${grafik[k].nama.replace(/\.svg$/, '').replace(/-/g, ' ')}](aset/${grafik[k].nama})\n`)
      .join('');
    if (!gambar) continue;
    if (hasil.includes(judul)) {
      hasil = hasil.replace(judul, `${judul}\n${gambar}`);
    }
  }

  // Grafik yang belum tertempel (karena judulnya tidak ditulis model) ditaruh di akhir.
  const terpakai = new Set();
  for (const [, kunci] of tempat) kunci.forEach(k => grafik[k] && terpakai.add(k));
  const sisa = Object.keys(grafik).filter(k => !terpakai.has(k));
  if (sisa.length) {
    hasil += '\n\n## Grafik Tambahan\n' +
      sisa.map(k => `\n![${grafik[k].nama}](aset/${grafik[k].nama})\n`).join('');
  }
  return hasil;
}

/* ------------------------------------------------------- markdown -> html */

function markdownKeHtml(md, grafik) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  const baris = md.split('\n');
  const keluar = [];
  let dalamDaftar = false;
  let i = 0;
  const tutupDaftar = () => { if (dalamDaftar) { keluar.push('</ul>'); dalamDaftar = false; } };

  while (i < baris.length) {
    const t = baris[i].trim();
    if (!t) { tutupDaftar(); i++; continue; }

    // gambar: SVG disisipkan langsung supaya halaman berdiri sendiri
    const gbr = t.match(/^!\[[^\]]*\]\(aset\/([^)]+)\)$/);
    if (gbr) {
      tutupDaftar();
      const berkas = gbr[1];
      const cocok = Object.values(grafik).find(g => g.nama === berkas);
      if (cocok) keluar.push(`<figure>${cocok.svg}</figure>`);
      i++;
      continue;
    }

    const jdl = t.match(/^(#{1,4})\s+(.*)$/);
    if (jdl) {
      tutupDaftar();
      keluar.push(`<h${jdl[1].length}>${inline(jdl[2])}</h${jdl[1].length}>`);
      i++;
      continue;
    }

    if (t.startsWith('|') && i + 1 < baris.length && /^\|[\s:|-]+\|$/.test(baris[i + 1].trim())) {
      tutupDaftar();
      const sel = r => r.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
      const kepala = sel(t);
      i += 2;
      const isi = [];
      while (i < baris.length && baris[i].trim().startsWith('|')) { isi.push(sel(baris[i])); i++; }
      keluar.push(
        '<div class="gulir"><table><thead><tr>' +
        kepala.map(h => `<th>${inline(h)}</th>`).join('') +
        '</tr></thead><tbody>' +
        isi.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    const li = t.match(/^[-*+]\s+(.*)$/);
    if (li) {
      if (!dalamDaftar) { keluar.push('<ul>'); dalamDaftar = true; }
      keluar.push(`<li>${inline(li[1])}</li>`);
      i++;
      continue;
    }

    tutupDaftar();
    keluar.push(`<p>${inline(t)}</p>`);
    i++;
  }
  tutupDaftar();
  return keluar.join('\n');
}

function halamanHtml(isiHtml, waktu) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Briefing Harian — ${waktu.tanggalPanjang}</title><style>
:root{color-scheme:light dark;--bg:#fff;--tx:#1a1a1a;--lb:#5b6472;--gr:#e3e6ea;--kd:#f6f7f9}
@media(prefers-color-scheme:dark){:root{--bg:#14161a;--tx:#e8eaed;--lb:#9aa4b2;--gr:#2a2f38;--kd:#1b1f26}}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:860px;margin:0 auto;padding:20px 18px 64px}
h1{font-size:1.6rem;line-height:1.25;margin:.2em 0 .5em;letter-spacing:-.01em}
h2{font-size:1.15rem;margin:1.9em 0 .5em;padding-top:.9em;border-top:1px solid var(--gr)}
h3{font-size:1rem;margin:1.4em 0 .4em}
p{margin:.7em 0}ul{margin:.6em 0;padding-left:1.25em}li{margin:.45em 0}
figure{margin:1.4em 0;padding:10px;background:#fff;border:1px solid var(--gr);border-radius:14px;overflow-x:auto}
figure svg{display:block}
.gulir{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:1em 0}
table{border-collapse:collapse;width:100%;font-size:.9rem;min-width:420px}
th,td{padding:9px 11px;border-bottom:1px solid var(--gr);text-align:left;white-space:nowrap}
th{background:var(--kd);font-weight:600;font-size:.82rem;text-transform:uppercase;letter-spacing:.03em;color:var(--lb)}
tbody tr:last-child td{border-bottom:none}
strong{font-weight:650}
.kaki{margin-top:3em;padding-top:1em;border-top:1px solid var(--gr);font-size:.8rem;color:var(--lb)}
</style></head><body><main>
${isiHtml}
<div class="kaki">Disusun otomatis oleh GitHub Actions pada ${waktu.tanggal} ${waktu.jam} WIB.
Laporan ini menyajikan situasi pasar, bukan nasihat investasi.</div>
</main></body></html>`;
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
  const { mentah, teks } = await ambilSemua();

  console.log('Membuat grafik...');
  const grafik = await buatGrafik(mentah, waktu);

  console.log('Meminta Gemini menulis laporan...');
  let isi = (await tanyaGemini(susunPrompt(teks, waktu), kunci)).trim();
  isi = isi.replace(/^```(markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
  isi = sisipkanGrafik(isi, grafik);

  const catatan = `<!-- Dibuat otomatis oleh GitHub Actions pada ${waktu.tanggal} ${waktu.jam} WIB -->`;
  const laporan = `${catatan}\n\n${isi}\n`;

  await mkdir(FOLDER_LAPORAN, { recursive: true });
  await writeFile(join(FOLDER_LAPORAN, `${waktu.tanggal}-briefing.md`), laporan, 'utf8');
  await writeFile(join(FOLDER_LAPORAN, 'terbaru.md'), laporan, 'utf8');
  await writeFile(join(FOLDER_LAPORAN, 'terbaru.html'), halamanHtml(markdownKeHtml(isi, grafik), waktu), 'utf8');

  console.log(`Selesai. ${laporan.length} karakter, ${Object.keys(grafik).length} grafik.`);
}

utama().catch(e => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
