# JelanWha

UI baca manhwa dengan React + Vite + Tailwind CSS + React Router + Lucide Icons. Data katalog dan chapter diambil melalui backend proxy supaya base API mudah diganti. Bookmark dan riwayat baca tersimpan di `localStorage`.

## Menjalankan lokal
1. Install Node.js 18+.
2. Ekstrak ZIP lalu jalankan:
   ```bash
   npm install
   npm run dev
   ```
3. Buka URL Vite yang ditampilkan (umumnya `http://localhost:5173`).

Backend proxy berjalan di `http://localhost:8787`. Atur `SHNGM_API_BASE` bila ingin mengganti API.

## Fitur UI
- Dropdown buatan sendiri (genre, urutan, pilih chapter) — tampil seperti web, bukan menu bawaan browser; di HP berubah jadi panel dari bawah.
- Explore dengan paginasi angka: `‹ Sebelumnya 1 2 3 … 20 Berikutnya ›` (filter & halaman tersimpan di URL).
- Chapter yang sudah selesai dibaca diberi centang (daftar chapter & pemilih chapter di pembaca).
- Home: banner gambar besar menyatu dengan judul, rak manhwa yang bisa digeser, lalu grid "Semua manhwa" dengan tombol muat lebih banyak.
- Riwayat menampilkan cover, chapter terakhir, dan tombol Lanjutkan.

## Akun (Google saja)
- Menu titik tiga di pojok kanan atas → **Masuk dengan Google** (setelah konfigurasi). Metode daftar/login email dan kata sandi telah dihapus. Login bersifat opsional: tanpa akun tetap bisa membaca, tapi bookmark/riwayat hanya tersimpan di perangkat itu.
- Setelah masuk, bookmark, riwayat, dan chapter yang sudah dibaca otomatis tersinkron ke akun dan bisa dibuka di perangkat lain.
- Data aplikasi lokal (misalnya bookmark, riwayat, komentar, dan tema) tetap dikelola backend. Identitas login diverifikasi menggunakan Firebase Authentication; data profil tampilan juga disimpan di Cloud Firestore.
- Opsional: set `AUTH_SECRET` (teks acak panjang) di `.env`; kalau kosong, server membuat rahasia sendiri di `data/secret.key`.

## Home dan filter Format
- **Home:** banner berisi manhwa **ongoing yang paling baru update** (bukan yang terpopuler; kalau manhwa ongoing kurang dari 3, diisi ongoing jenis lain), lalu rak **Lagi populer**, rak **Manhwa terbaru**, dan grid **Semua update** dengan tombol muat lebih banyak.
- **Explore:** ada pilihan **Format** di samping Genre: Semua format / Manhwa / Manhua / Manga. Bisa digabung dengan genre, urutan, dan pencarian. Alamat `?type=manhwa` juga bisa dipakai langsung.
- Jenis ditentukan dari kode negara judul: KR = manhwa, CN = manhua, JP = manga. Judul tanpa data negara tidak muncul saat Format dipilih.
- Kartu punya label jenis kecil di pojok poster dan waktu update chapter. Poster ditampilkan apa adanya (tidak dipotong).
- Label sumber di teks judul/sinopsis (mis. `[Shinigami]`, `shinigami.asia`, `- Shinigami`) otomatis dibuang. Judul asli yang memang memuat kata "Shinigami" tidak diubah.
- Teknis: server mengambil katalog lengkap (±1000 judul), menyimpannya di memori 5 menit (data lama tetap dipakai kalau API sumber sedang mati), lalu menyaring per jenis. Endpoint: `GET /api/home` dan `GET /api/list?type=manhwa|manhua|manga` (mendukung `q`, `sort`, `genre`, `page`).

## Edit profil & warna web
- Menu titik tiga (pojok kanan atas) → **Edit profil** dan **Tampilan & warna**.
- **Nama tampilan**: bisa diganti kapan saja (2–40 karakter). Nama baru otomatis ikut di semua komentar lamamu. Dikosongkan = nama otomatis "Pembaca xxxx". Email tidak pernah ditampilkan.
- **Foto profil**: pilih JPG/PNG/WEBP/GIF, geser + zoom untuk mengatur potongan bulat, lalu **Pakai foto**. Foto dipotong persegi 256×256 di browser (±20–40 KB), disimpan di `data/uploads/` (awalan `av-`), dan tampil di menu akun serta komentar. Foto lama otomatis dihapus saat diganti. Ada tombol **Hapus foto**.
- **Warna web**: 8 warna aksen siap pakai + pemilih warna bebas (lingkaran pelangi), dan 3 gaya latar (mengikuti aksen / abu netral / hitam pekat untuk layar AMOLED). Ada pratinjau langsung; **Simpan warna** untuk menyimpan, **Bawaan** untuk mengembalikan.
- Tanpa akun: warna tersimpan di perangkat itu saja. Dengan akun: warna ikut tersimpan di akun dan dipakai otomatis saat masuk di perangkat lain.
- Warna aksen yang terlalu gelap/terang otomatis disesuaikan supaya teks tetap terbaca.
- Teknis: seluruh warna di `src/styles.css` memakai variabel CSS (`--h`, `--s`, `--l`, `--lilac`, …) yang diatur oleh `src/theme.js`. Endpoint baru: `PUT /api/profile`, `POST /api/profile/avatar`, `DELETE /api/profile/avatar`. Tidak ada dependensi baru, jadi tidak perlu `npm install` ulang.

## Komentar, reaksi emoji, dan anti-spoiler
- Di bawah setiap chapter (setelah halaman terakhir) ada bagian **Komentar**. Siapa pun bisa membaca; **menulis komentar, mengirim gambar, dan bereaksi wajib login** supaya pelanggar bisa di-ban.
- **Reaksi emoji** (👍 ❤️ 😂 😮 😢 🔥): satu reaksi per orang. Ada reaksi untuk chapter ("Gimana chapter ini?") dan untuk tiap komentar. Tekan emoji yang sama lagi untuk membatalkan.
- **Gambar di komentar**: JPG/PNG/WEBP/GIF, maksimal 3 MB, satu gambar per komentar. Gambar besar dikecilkan otomatis di browser. Tipe file dicek dari isi file (SVG ditolak). Disimpan di `data/uploads/` — jangan dihapus.
- **Aturan spoiler** tampil di atas komentar. Cara penegakannya:
  1. **Otomatis, langsung ban**: komentar yang memakai penanda spoiler jelas (`[spoiler]`, `||teks||`, `>!teks!<`, "spoiler alert", "spoiler: ...") ditolak dan akunnya di-ban. Matikan ban otomatis dengan `SPOILER_AUTOBAN=0` di `.env`.
  2. **Otomatis, ditolak + peringatan** (tanpa ban): kalimat yang terindikasi membocorkan chapter berikutnya/ending, mis. "chapter depan dia mati".
  3. **Laporan pembaca**: tombol **Laporkan** di tiap komentar (untuk teks maupun gambar). Setelah 3 pelapor berbeda, komentar disembunyikan sampai admin memutuskan.
  4. **Admin** memutuskan ban/hapus (lihat di bawah).
- Pengguna yang di-ban masih bisa masuk dan membaca, tetapi tidak bisa berkomentar, bereaksi, atau mengunggah gambar. Komentar lamanya ikut disembunyikan. Ia melihat tombol banding lewat email kontak.
- **Keterbatasan penting**: deteksi otomatis hanya mencocokkan pola teks; ia tidak memahami isi cerita dan tidak bisa menilai gambar. Spoiler yang ditulis biasa tanpa penanda hanya bisa ditangkap lewat laporan pembaca + admin. Orang yang di-ban bisa saja membuat akun email baru.

### Admin
Isi `ADMIN_TOKEN` di `.env` (teks acak panjang), lalu pakai header `x-admin-token`:
```bash
# lihat komentar yang dilaporkan / disembunyikan (menampilkan id pengguna + email)
curl -H "x-admin-token: TOKEN" http://localhost:8787/api/admin/reports
# ban / unban
curl -X POST -H "x-admin-token: TOKEN" -H "Content-Type: application/json" -d '{"userId":"ID","reason":"spoiler"}' http://localhost:8787/api/admin/ban
curl -X POST -H "x-admin-token: TOKEN" -H "Content-Type: application/json" -d '{"userId":"ID"}' http://localhost:8787/api/admin/unban
# hapus komentar / pulihkan komentar yang ternyata aman
curl -X DELETE -H "x-admin-token: TOKEN" http://localhost:8787/api/admin/comments/ID_KOMENTAR
curl -X POST -H "x-admin-token: TOKEN" http://localhost:8787/api/admin/comments/ID_KOMENTAR/restore
```
Data komentar ada di `data/comments.json`; ikut di-backup bersama `data/db.json` dan `data/uploads/` (berisi gambar komentar dan foto profil).

## API yang dipakai
Adapter mengacu pada base URL dan pola endpoint yang terdapat di file TXT yang diberikan:
- `GET /manga/list?sort=latest&page=1&page_size=20`
- `GET /manga/list?q=...&genre_include=<id>&page=1&page_size=20`
- `GET /genre/list`
- `GET /manga/top?filter=daily&page=1&page_size=20`
- `GET /manga/detail/:id`
- `GET /chapter/:mangaId/list?...`
- `GET /chapter/detail/:chapterId`

Ketersediaan endpoint, CORS, dan kebijakan penggunaan pihak ketiga bisa berubah. API yang diberikan tidak membuktikan bahwa semua gambar chapter berlisensi untuk redistribusi. Gunakan hanya konten yang Anda berhak akses/distribusikan dan periksa ketentuan sumbernya. Aplikasi tidak menghosting atau menyalin gambar chapter ke server sendiri.

## Build
```bash
npm run build
npm start
```
Untuk deploy produksi, frontend hasil build perlu disajikan oleh hosting statis dan backend Node dijalankan pada server yang sama atau diatur melalui reverse proxy. Endpoint gambar eksternal bisa gagal jika upstream memblokir akses browser.


## Login Google dengan Firebase Authentication + Cloud Firestore

### 1. Aktifkan Google provider
1. Buka https://console.firebase.google.com/ dan pilih proyek Firebase.
2. Buka **Authentication → Sign-in method** lalu aktifkan **Google**.
3. Di **Project settings → Your apps**, daftarkan/pilih aplikasi Web dan salin konfigurasi web Firebase.
4. Pada Authentication settings, pastikan domain yang digunakan (`localhost` untuk pengujian lokal dan domain produksi) ada di daftar **Authorized domains**.

### 2. Konfigurasi `.env`
Salin `.env.example` menjadi `.env`, lalu isi variabel `VITE_FIREBASE_*` dari konfigurasi aplikasi web Firebase. Variabel `FIREBASE_PROJECT_ID` harus cocok dengan project ID tersebut.

### 3. Siapkan Firebase Admin SDK untuk backend
Backend harus memverifikasi Firebase ID token; jangan mengandalkan data profil atau token yang dikirim browser tanpa verifikasi.
1. Firebase Console → **Project settings → Service accounts** → **Generate new private key**.
2. Simpan JSON service account di folder privat yang tidak ikut dibagikan/diunggah. Jangan taruh isi file itu ke kode frontend atau Git.
3. Atur `FIREBASE_SERVICE_ACCOUNT_PATH` di `.env` ke path absolut file JSON tersebut. Contoh Termux: `/data/data/com.termux/files/home/.config/jelanwha/firebase-admin.json`. Pastikan folder tujuan sudah dibuat dan file disalin ke sana.
4. Jangan pernah memasukkan service account JSON ke ZIP yang dibagikan. Jika file tersebut pernah terpublikasi, cabut/rotasi kredensialnya.

### 4. Aturan keamanan Cloud Firestore
Buat koleksi `profiles`; dokumen setiap pengguna menggunakan Firebase UID sebagai ID dokumen. Aturan minimal yang sesuai dengan fitur ini:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /profiles/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null
        && request.auth.uid == uid
        && request.resource.data.uid == uid
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 40;
      allow delete: if false;
    }
  }
}
```

Aturan ini membatasi pengguna hanya mengakses dokumen profil miliknya. Jika nanti aplikasi menambahkan profil publik, buat aturan baca publik secara sengaja setelah menentukan data apa yang aman ditampilkan.

### 5. Instal dan jalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:5173`. Login Google akan membuka pemilih akun Google melalui Firebase. Nama yang diubah di **Menu akun → Edit profil** disimpan ke Cloud Firestore dan disinkronkan ke backend agar nama yang muncul di komentar juga ikut berubah.

Catatan: backend masih memakai database lokal untuk data aplikasi lain (misalnya bookmark/riwayat, komentar, tema, dan moderasi). Firebase Authentication menangani identitas login dan Firestore menyimpan profil. Gunakan penyimpanan persisten untuk folder `data/` jika deploy ke server produksi.
