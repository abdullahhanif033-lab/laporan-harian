# Laporan Harian — otomasi di GitHub Actions

Repo ini menyusun **briefing pasar harian** setiap pukul **06.00 WIB** dan
menyimpan hasilnya sebagai berkas markdown di folder `harian/`. Semua berjalan
di server GitHub, jadi **laptop tidak perlu menyala**.

## Isi repo

```
scripts/buat-laporan.mjs          skrip pembuat laporan (Node.js, tanpa pustaka luar)
.github/workflows/laporan-harian.yml   jadwal & langkah otomatisnya
harian/                           hasil laporan
  ├── 2026-09-02-briefing.md      satu berkas per hari
  └── terbaru.md                  salinan hari terakhir
```

## Sumber data

| Sumber | Dipakai untuk | Biaya |
|---|---|---|
| CoinGecko | Harga 15 koin teratas, kapitalisasi pasar, dominasi BTC | Gratis |
| Alternative.me | Indeks Fear & Greed hari ini vs kemarin | Gratis |
| Cointelegraph (RSS) | Berita crypto 24 jam terakhir | Gratis |
| BBC World (RSS) | Berita dunia 24 jam terakhir | Gratis |
| Google Gemini | Menyusun semuanya jadi laporan Bahasa Indonesia | Kuota gratis |

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
