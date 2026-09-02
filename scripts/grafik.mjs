// =====================================================================
//  Pembuat grafik SVG — tanpa pustaka luar.
//
//  Palet dan aturannya mengikuti skill "analis-aset" milik user
//  (references/diagram.md): violet · teal · amber · pink, setiap mark
//  wajib membawa label angka yang terlihat, dan warna tidak pernah
//  bekerja sendirian — selalu ditemani simbol arah.
// =====================================================================

export const WARNA = {
  violet: '#4A3AA7',
  teal:   '#1BAF7A',
  amber:  '#EDA100',
  pink:   '#E87BA4',
  baik:   '#0CA30C',
  buruk:  '#D03B3B',
  tinta:  '#0b0b0b',
  redup:  '#5b6472',
  garis:  '#e3e6ea',
  kertas: '#ffffff'
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/* ------------------------------------------------------------ pemformatan */

export function angka(n, desimal = null) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  let d = desimal;
  if (d === null) {
    const abs = Math.abs(n);
    d = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  }
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  }).format(n);
}

export function uangRingkas(n) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  if (n >= 1e12) return '$' + angka(n / 1e12, 2) + ' T';
  if (n >= 1e9) return '$' + angka(n / 1e9, 1) + ' M';
  if (n >= 1e6) return '$' + angka(n / 1e6, 1) + ' jt';
  return '$' + angka(n);
}

export function persen(n, desimal = 2) {
  if (n == null || Number.isNaN(n)) return 'n/a';
  return (n > 0 ? '+' : '') + angka(n, desimal) + '%';
}

function arah(n) {
  if (n == null || Number.isNaN(n)) return '→';
  if (n > 0.05) return '▲';
  if (n < -0.05) return '▼';
  return '→';
}

function lolos(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bungkus(lebar, tinggi, isi, judul) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tinggi}" width="100%" role="img" aria-label="${lolos(judul)}" style="max-width:${lebar}px;height:auto;font-family:${FONT}">
<rect width="${lebar}" height="${tinggi}" rx="14" fill="${WARNA.kertas}"/>
${isi}
</svg>`;
}

function teks(x, y, isi, { ukuran = 13, warna = WARNA.tinta, tebal = 400, anchor = 'start' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${ukuran}" fill="${warna}" font-weight="${tebal}" text-anchor="${anchor}">${lolos(isi)}</text>`;
}

/* ------------------------------------------------------- 1. Kartu metrik */

export function kartuMetrik(kartu) {
  const lebar = 840, tinggi = 168, jarak = 14;
  const lebarKartu = (lebar - jarak * (kartu.length - 1)) / kartu.length;
  const bagian = [];

  kartu.forEach((k, i) => {
    const x = i * (lebarKartu + jarak);
    const warnaUbah = k.ubah == null ? WARNA.redup : k.ubah >= 0 ? WARNA.baik : WARNA.buruk;

    bagian.push(`<rect x="${x}" y="0" width="${lebarKartu}" height="${tinggi}" rx="12" fill="#fbfbfc" stroke="${WARNA.garis}"/>`);
    bagian.push(`<rect x="${x}" y="0" width="${lebarKartu}" height="4" rx="2" fill="${k.warna || WARNA.violet}"/>`);
    bagian.push(teks(x + 18, 40, k.label.toUpperCase(), { ukuran: 11, warna: WARNA.redup, tebal: 600 }));
    bagian.push(teks(x + 18, 84, k.nilai, { ukuran: 27, tebal: 700 }));
    if (k.ubah != null) {
      bagian.push(teks(x + 18, 116, `${arah(k.ubah)} ${persen(k.ubah)}`, { ukuran: 15, warna: warnaUbah, tebal: 650 }));
    }
    if (k.catatan) {
      bagian.push(teks(x + 18, 145, k.catatan, { ukuran: 11, warna: WARNA.redup }));
    }
  });

  return bungkus(lebar, tinggi, bagian.join('\n'), 'Kartu metrik utama pasar');
}

/* ------------------------------------------------- 2. Tren garis (harga) */

export function grafikTren(titik, { judul, satuan = '$', warna = WARNA.violet }) {
  const lebar = 840, tinggi = 300;
  const kiri = 70, kanan = 30, atas = 58, bawah = 46;
  const lebarPlot = lebar - kiri - kanan;
  const tinggiPlot = tinggi - atas - bawah;

  const nilai = titik.map(t => t.nilai);
  const min = Math.min(...nilai), maks = Math.max(...nilai);
  const rentang = (maks - min) || 1;
  const pad = rentang * 0.18;
  const bawahSkala = min - pad, atasSkala = maks + pad;

  const px = i => kiri + (titik.length === 1 ? lebarPlot / 2 : (i / (titik.length - 1)) * lebarPlot);
  const py = v => atas + tinggiPlot - ((v - bawahSkala) / (atasSkala - bawahSkala)) * tinggiPlot;

  const bagian = [];
  bagian.push(teks(kiri, 30, judul, { ukuran: 15, tebal: 700 }));

  // garis bantu horizontal + label sumbu
  for (let g = 0; g <= 3; g++) {
    const v = bawahSkala + ((atasSkala - bawahSkala) * g) / 3;
    const y = py(v);
    bagian.push(`<line x1="${kiri}" y1="${y}" x2="${lebar - kanan}" y2="${y}" stroke="${WARNA.garis}" stroke-width="1"/>`);
    bagian.push(teks(kiri - 10, y + 4, satuan + angka(v, v >= 1000 ? 0 : 2), { ukuran: 11, warna: WARNA.redup, anchor: 'end' }));
  }

  const jalur = titik.map((t, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(t.nilai).toFixed(1)}`).join(' ');
  const area = `${jalur} L${px(titik.length - 1).toFixed(1)},${(atas + tinggiPlot).toFixed(1)} L${px(0).toFixed(1)},${(atas + tinggiPlot).toFixed(1)} Z`;

  bagian.push(`<path d="${area}" fill="${warna}" opacity="0.10"/>`);
  bagian.push(`<path d="${jalur}" fill="none" stroke="${warna}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);

  titik.forEach((t, i) => {
    const x = px(i), y = py(t.nilai);
    const ujung = i === 0 || i === titik.length - 1;
    bagian.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${ujung ? 5 : 3.5}" fill="${warna}"/>`);
    // Label angka hanya di titik ujung dan titik ekstrem, supaya tidak bertumpuk.
    if (ujung || t.nilai === min || t.nilai === maks) {
      const anchor = i === 0 ? 'start' : i === titik.length - 1 ? 'end' : 'middle';
      bagian.push(teks(x, y - 14, satuan + angka(t.nilai, t.nilai >= 1000 ? 0 : 2), { ukuran: 12, tebal: 650, anchor }));
    }
    bagian.push(teks(x, tinggi - 18, t.label, { ukuran: 11, warna: WARNA.redup, anchor: 'middle' }));
  });

  return bungkus(lebar, tinggi, bagian.join('\n'), judul);
}

/* ------------------------------------------- 3. Batang perubahan 24 jam */

export function grafikPerubahan(baris, { judul }) {
  const tinggiBaris = 30;
  const lebar = 840;
  const atas = 58;
  const tinggi = atas + baris.length * tinggiBaris + 24;
  const kiri = 96;
  const tengah = kiri + 300;
  const skala = 190; // piksel per 5%

  const maksAbs = Math.max(5, ...baris.map(b => Math.abs(b.nilai || 0)));
  const px = v => tengah + (v / maksAbs) * skala;

  const bagian = [];
  bagian.push(teks(30, 30, judul, { ukuran: 15, tebal: 700 }));
  bagian.push(`<line x1="${tengah}" y1="${atas - 8}" x2="${tengah}" y2="${tinggi - 18}" stroke="${WARNA.garis}" stroke-width="1.5"/>`);

  baris.forEach((b, i) => {
    const y = atas + i * tinggiBaris;
    const v = b.nilai || 0;
    const warna = v >= 0 ? WARNA.teal : WARNA.buruk;
    const x1 = Math.min(tengah, px(v));
    const w = Math.abs(px(v) - tengah);

    bagian.push(teks(30, y + 14, b.label, { ukuran: 12, tebal: 600 }));
    bagian.push(`<rect x="${x1.toFixed(1)}" y="${y + 3}" width="${Math.max(w, 1.5).toFixed(1)}" height="15" rx="3" fill="${warna}" opacity="0.85"/>`);
    const xLabel = v >= 0 ? px(v) + 8 : px(v) - 8;
    bagian.push(teks(xLabel, y + 15, `${arah(v)} ${persen(v)}`, {
      ukuran: 11.5, tebal: 650, warna, anchor: v >= 0 ? 'start' : 'end'
    }));
    if (b.catatan) {
      bagian.push(teks(lebar - 24, y + 15, b.catatan, { ukuran: 11, warna: WARNA.redup, anchor: 'end' }));
    }
  });

  return bungkus(lebar, tinggi, bagian.join('\n'), judul);
}

/* ------------------------------------------- 4. Indeks Fear & Greed 30 hari */

export function grafikSentimen(titik, { judul }) {
  const lebar = 840, tinggi = 260;
  const kiri = 52, kanan = 118, atas = 58, bawah = 38;
  const lebarPlot = lebar - kiri - kanan;
  const tinggiPlot = tinggi - atas - bawah;

  const px = i => kiri + (titik.length === 1 ? lebarPlot / 2 : (i / (titik.length - 1)) * lebarPlot);
  const py = v => atas + tinggiPlot - (v / 100) * tinggiPlot;

  const zona = [
    { dari: 0,  sampai: 25,  nama: 'Takut ekstrem', warna: '#D03B3B' },
    { dari: 25, sampai: 45,  nama: 'Takut',         warna: '#EDA100' },
    { dari: 45, sampai: 55,  nama: 'Netral',        warna: '#9aa4b2' },
    { dari: 55, sampai: 75,  nama: 'Serakah',       warna: '#1BAF7A' },
    { dari: 75, sampai: 100, nama: 'Serakah ekstrem', warna: '#0CA30C' }
  ];

  const bagian = [];
  bagian.push(teks(kiri, 30, judul, { ukuran: 15, tebal: 700 }));

  for (const z of zona) {
    const y1 = py(z.sampai), y2 = py(z.dari);
    bagian.push(`<rect x="${kiri}" y="${y1}" width="${lebarPlot}" height="${(y2 - y1).toFixed(1)}" fill="${z.warna}" opacity="0.09"/>`);
    bagian.push(teks(kiri + lebarPlot + 10, (y1 + y2) / 2 + 4, z.nama, { ukuran: 10.5, warna: WARNA.redup }));
  }

  for (const v of [0, 50, 100]) {
    bagian.push(teks(kiri - 10, py(v) + 4, String(v), { ukuran: 11, warna: WARNA.redup, anchor: 'end' }));
  }

  const jalur = titik.map((t, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(t.nilai).toFixed(1)}`).join(' ');
  bagian.push(`<path d="${jalur}" fill="none" stroke="${WARNA.violet}" stroke-width="2.5" stroke-linejoin="round"/>`);

  const akhir = titik.length - 1;
  bagian.push(`<circle cx="${px(akhir).toFixed(1)}" cy="${py(titik[akhir].nilai).toFixed(1)}" r="5.5" fill="${WARNA.violet}"/>`);
  bagian.push(teks(px(akhir) - 10, py(titik[akhir].nilai) - 12, `hari ini: ${titik[akhir].nilai}`, { ukuran: 12, tebal: 700, anchor: 'end' }));

  if (titik.length > 1) {
    bagian.push(teks(px(0), tinggi - 14, titik[0].label, { ukuran: 11, warna: WARNA.redup, anchor: 'start' }));
    bagian.push(teks(px(akhir), tinggi - 14, titik[akhir].label, { ukuran: 11, warna: WARNA.redup, anchor: 'end' }));
  }

  return bungkus(lebar, tinggi, bagian.join('\n'), judul);
}
