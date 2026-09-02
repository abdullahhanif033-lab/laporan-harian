# Laporan Harian — otomasi di GitHub Actions

Repo ini menyusun **briefing pasar harian** setiap pukul **06.00 WIB** dan
menyimpan hasilnya sebagai berkas markdown di folder `harian/`. Semua berjalan
di server GitHub, jadi **laptop tidak perlu menyala**.

## Isi repo

```
scripts/buat-laporan.mjs          pengambil data, pemindai kandidat, penyusun laporan
scripts/grafik.mjs                pembuat grafik SVG (tanpa pustaka luar)
.github/workflows/laporan-harian.yml   jadwal & langkah otomatisnya
harian/                           hasil laporan
  ├── 2026-09-02-briefing.md      satu berkas per hari
  ├── terbaru.md                  salinan hari terakhir
  ├── terbaru.html                versi berdiri sendiri untuk dibaca di HP
  └── aset/                       grafik SVG, diberi awalan tanggal
```

## Sumber data

Semuanya gratis dan tanpa API key, kecuali Gemini yang memakai kuota gratis.

| Sumber | Dipakai untuk |
|---|---|
| CoinGecko `/coins/markets` | Harga + perubahan 1 jam/24 jam/7 hari/30 hari untuk 100 koin teratas |
| CoinGecko `/coins/categories` | Performa per sektor, untuk membaca rotasi modal |
| CoinGecko `/search/trending` | Koin yang paling banyak dicari |
| CoinGecko `/market_chart` | Deret harga Bitcoin 7 hari |
| Alternative.me | Indeks Fear & Greed 30 hari |
| Cointelegraph (RSS) | Berita crypto 24 jam |
| BBC World (RSS) | Berita dunia 24 jam |
| Reddit r/CryptoCurrency (RSS) | Percakapan ritel |
| CryptoPanic (RSS) | Berita yang paling banyak direaksikan komunitas |
| Google Gemini | Menyusun semuanya jadi laporan Bahasa Indonesia |

**Catatan soal Twitter/X:** sejak Februari 2026 tidak ada lagi tier gratis; membaca
tweet ditagih $0,005 per pos. Reddit dan CryptoPanic dipakai sebagai pengganti gratis
untuk membaca arah percakapan.

**Catatan soal CryptoBubbles:** yang ditiru adalah *model datanya* — satu koin dibaca
pada beberapa rentang waktu sekaligus — memakai API resmi CoinGecko, bukan endpoint
internal situsnya. Peta gelembungnya digambar sendiri di `scripts/grafik.mjs`.

## Isi laporan

| Bagian | Isi |
|---|---|
| Yang Paling Penting Hari Ini | Satu hal yang paling menentukan arah, beserta alasan pemilihannya |
| Pasar Crypto | Tabel 8 koin teratas + kartu metrik + grafik perubahan 24 jam |
| Sentimen Pasar | Fear & Greed 30 hari + tren Bitcoin sepekan |
| Rotasi Sektor | Sektor terkuat dan terlemah, ke mana modal berpindah |
| Berita & Kebijakan Penting | Berita berdampak, masing-masing dengan alasan kenapa penting |
| Yang Sedang Ramai Dibicarakan | Perhatian ritel — ditandai jelas sebagai perhatian, bukan kualitas |
| Kandidat untuk Diteliti | Koin dengan sinyal tak biasa + alasan mikro dan makro + peta gelembung |
| Sisi Lain | Argumen yang melawan pembacaan utama |
| Agenda & Batas Laporan | Peristiwa mendatang, dan apa yang laporan ini tidak bisa jawab |

Cara berpikirnya mengikuti skill `analis-aset` di `D:\Ai Agent\skill\`: jantung dulu baru
aliran darah, fakta dipisahkan dari interpretasi dan spekulasi, tidak pernah mengarang
angka, dan wajib ada sisi lain. Kandidat yang muncul di sini **baru sinyal mentah** —
pembedahannya memakai `references/berburu-kandidat.md` lalu `framework-crypto.md`.

## Yang perlu disiapkan sekali saja

1. **Secret `GEMINI_API_KEY`** — di GitHub: *Settings → Secrets and variables →
   Actions → New repository secret*. Isi dengan API key dari
   [Google AI Studio](https://aistudio.google.com/apikey).
2. Selesai. Jadwalnya jalan sendiri.

## Menjalankan manual

Lewat GitHub: buka tab **Actions → Laporan Harian → Run workflow**.

Lewat laptop:

```bash
GEMINI_API_KEY=kunci-anda node scripts/buat-laporan.mjs
```

## Catatan

- Jadwal GitHub Actions **bisa telat 5–20 menit** dari waktu yang diminta. Ini
  wajar dan di luar kendali kita; GitHub memprioritaskan antrean gratis
  belakangan saat sedang ramai.
- GitHub menonaktifkan jadwal otomatis kalau repo **tidak ada aktivitas 60 hari**.
  Karena laporan disimpan setiap hari, repo ini tidak akan pernah menganggur.
- Laporan bersifat **informasi situasi, bukan nasihat investasi**.
