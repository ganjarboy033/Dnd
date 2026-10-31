# Kanade

Downloader (TikTok, YouTube, Instagram, Spotify, dll) + pemutar musik ala YMusic + anime/komik, dengan scraper
[`@coflyn/scrapr`](https://github.com/coflyn/scrapr).

```
public/   frontend statis (vanilla JS, tanpa build)  -> juga webDir Capacitor
api/      fungsi serverless Vercel (resolve, music, anime, comic)
lib/      helper server
```

## Cara kerja
App tidak men-scrape sendiri. Ia memanggil API di Vercel (`/api/*`) yang menjalankan scrapr dan mengembalikan **link langsung**.
File lalu diunduh **langsung dari CDN ke HP** (Capacitor Filesystem), jadi tidak melewati Vercel (batas respons serverless 4,5 MB).

| Endpoint | Fungsi |
|---|---|
| `GET /api/resolve?url=&mode=audio\|video\|all` | deteksi platform + fallback antar scraper |
| `GET /api/music?q=` | cari lagu (YouTube) |
| `GET /api/anime?action=search\|episodes\|stream` | otakudesu, gogoanime |
| `GET /api/comic?action=search\|chapters\|pages` | komiku, komikindo, asurascans |

## 1. Deploy ke Vercel
```bash
npm i
npx vercel          # atau import repo di vercel.com (Framework: Other)
```
Hobby plan: set `maxDuration` di `vercel.json` sesuai batas akunmu. Scraper yang butuh Playwright (savetik, fdown, snapinsta) tidak jalan di Vercel dan sudah dilewati.

## 2. Build APK (paling mudah: GitHub Actions)
1. Buat repo GitHub, upload isi folder ini, push ke branch `main`.
2. Tab **Actions** → **Build APK** → **Run workflow** (otomatis juga tiap push).
3. Setelah ±5–8 menit, unduh artifact **Kanade-debug-apk** → ekstrak → pasang `app-debug.apk`.
4. Buka app → **Setelan** → isi alamat Vercel → **Simpan**.

### Atau build lokal
```bash
npm i
npm run cap:add      # buat folder android/ + pasang kode native Kanade
npm run cap:sync
npm run cap:open     # Android Studio -> Build > Build APK(s)
```
Butuh JDK 21 dan Android SDK. Skrip `scripts/patch-android.mjs` menyalin `native/*.java` dan menambal AndroidManifest (izin notifikasi, foreground service, filter Bagikan).

## Fitur
- **Beranda**: tempel/otomatis deteksi clipboard, pilih kualitas, foto multi-unduh, playlist/album, riwayat.
- **Musik**: cari, antrean, putar berikutnya, shuffle/repeat, kecepatan, sleep timer, lirik sinkron (LRCLIB), suka, playlist, unduh MP3, lanjut antrean saat dibuka lagi.
- **Jelajah**: cari anime & komik, daftar episode/chapter, putar/unduh video, pembaca komik.
- **Pustaka**: disukai, playlist, unduhan (progress, putar offline, bagikan, hapus), riwayat.

## Native Android (folder `native/`)
- `KanadeMediaService`: notifikasi media + kontrol lock screen + foreground service (audio tetap jalan saat layar mati).
- `KanadePlugin`: `updateMedia`, `stopMedia`, `saveToMediaStore` (salin ke Musik/Film/Gambar › Kanade), dan event `sharedText` (menu **Bagikan** dari app lain langsung menganalisis tautan).

## Batasan yang perlu kamu tahu
- Kode native **belum pernah dikompilasi/diuji di perangkat** oleh pembuatnya. Jika build gagal, salin log error dari tab Actions.
- APK yang dihasilkan adalah **debug** (bisa dipasang langsung). Untuk rilis, tanda tangani sendiri.
- Unduhan disalin dua kali (folder app + galeri). Matikan di Setelan bila ingin hemat ruang.
- Scraper bergantung pada situs pihak ketiga; bila ada yang mati, `npm i @coflyn/scrapr@latest` lalu redeploy. IP Vercel kadang diblokir situs tertentu.
- Pencarian musik membaca halaman YouTube, jadi bisa rusak jika strukturnya berubah.
- Kode UI ditulis sendiri (Mori/Nimiyo berlisensi GPL-3.0, jadi tidak disalin). Scrapr berlisensi MIT.
- Gunakan hanya untuk konten milik sendiri atau yang diizinkan pemiliknya, dan patuhi ketentuan tiap platform.
