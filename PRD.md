# PRD — Project Manager / Service Runner (Aplikasi Desktop Linux)

> Dokumen ini adalah draf awal. Silakan review dulu sebelum mulai implementasi.

---

## 1. Latar Belakang

Saya punya banyak projek (website, sistem gudang, sistem keuangan, dll). Setiap
projek biasanya terdiri dari beberapa service terpisah, contohnya:

- Frontend
- Backend
- API
- Storage / service tambahan

Setiap service harus dijalankan manual: buka folder satu per satu, pindah ke
terminal, lalu ketik command (`npm run dev`, `npm run start:dev`, dst). Port
sudah diatur berbeda-beda di masing-masing projek.

**Masalah:** terlalu banyak langkah manual, terminal penuh banyak tab, sulit
melihat status, sulit stop dengan rapi.

**Solusi:** satu aplikasi desktop sederhana yang menampung semua projek + semua
service-nya, lalu tinggal klik **Run** / **Stop** dan pantau status + log dari
satu layar.

---

## 2. Tujuan

1. Mengelola daftar projek dan service dalam satu tempat.
2. Menjalankan (`Run`) dan menghentikan (`Stop`) tiap service dengan satu klik.
3. Melihat status (Running / Stopped / Error) tiap service secara realtime.
4. Melihat log output tiap service tanpa membuka terminal.
5. Konfigurasi tersimpan otomatis, tidak perlu input ulang.

**Bukan tujuan (di luar scope):**
- Bukan pengganti PM2/systemd yang lengkap (tidak perlu daemon, restart
  otomatis, cluster, dsb — kecuali nanti dibutuhkan).
- Bukan tools CI/CD.

---

## 3. Konsep & Istilah

| Istilah  | Arti                                                                 |
|----------|----------------------------------------------------------------------|
| Projek   | Satu sistem utuh, misal "Sistem Gudang", "Sistem Keuangan".          |
| Service  | Satu proses yang dijalankan dari sebuah direktori, misal "Frontend", "Backend", "API", "Storage". |
| Command  | Perintah terminal yang dipakai menjalankan service, misal `npm run dev`. |
| Status   | Kondisi service: `stopped`, `starting`, `running`, `error`.          |

---

## 4. Data Model

### 4.1 Project

| Field       | Tipe     | Keterangan                          |
|-------------|----------|-------------------------------------|
| id          | string   | ID unik (UUID)                      |
| name        | string   | Nama projek, contoh "Sistem Gudang" |
| createdAt   | datetime | Waktu dibuat                        |

### 4.2 Service

| Field     | Tipe     | Keterangan                                      |
|-----------|----------|-------------------------------------------------|
| id        | string   | ID unik (UUID)                                  |
| projectId | string   | Relasi ke Project                               |
| name      | string   | Nama service, contoh "Frontend", "Backend"      |
| path      | string   | Path absolut direktori service                  |
| command   | string   | Command untuk run, contoh `npm run dev`         |
| port      | number   | (opsional) Port service, contoh `3000`          |
| status    | enum     | `stopped` \| `starting` \| `running` \| `error` |
| pid       | number   | (runtime) PID proses saat running               |
| createdAt | datetime | Waktu dibuat                                    |

> Status dan PID adalah **data runtime** (tidak disimpan permanen). Saat
> aplikasi ditutup, status dianggap tidak aktif.

### 4.3 Penyimpanan Konfigurasi

Semua data Project & Service disimpan ke file JSON lokal, contoh:
`~/.local/share/project-manager/config.json`.

---

## 5. Alur Penggunaan (User Flow)

### 5.1 Pertama Kali Buka Aplikasi

- Tampil daftar projek.
- Jika belum ada projek, tampil halaman kosong + tombol **"Tambah Projek"**.

### 5.2 Menambah Projek

1. Klik **"Tambah Projek"**.
2. Isi **Nama Projek** (contoh: `Sistem Gudang`).
3. Klik **Simpan**.
4. Projek muncul di daftar.

### 5.3 Menambah Service ke Projek

1. Buka/klik projek `Sistem Gudang`.
2. Klik **"Tambah Service"**.
3. Isi form:
   - **Nama** → `Frontend`
   - **Path** → `/home/user/projects/gudang/frontend` (bisa pakai tombol browse folder)
   - **Command** → pilih dari daftar umum (`npm run dev`, `npm run start:dev`,
     `npm start`, `yarn dev`, dll) **atau** ketik bebas.
   - **Port** → `3000` (opsional)
4. Klik **Simpan**.
5. Ulangi langkah 2–4 untuk `Backend`, `API`, `Storage`, dst.

### 5.4 Menjalankan Service (Run)

1. Klik tombol **Run** pada baris service.
2. Aplikasi:
   - Buka direktori `path`.
   - Eksekusi `command` sebagai child process.
   - Status berubah `starting` → `running`.
   - Tampilkan PID.
3. Log output (stdout + stderr) mulai muncul di panel log.

### 5.5 Menghentikan Service (Stop)

1. Klik tombol **Stop** pada service yang sedang `running`.
2. Aplikasi menghentikan proses **beserta seluruh child process-nya**
   (process tree), agar tidak ada proses zombie/orphan.
3. Status berubah `stopped`.

### 5.6 Melihat Log

- Klik service → panel log menampilkan output realtime.
- Log terpisah per service.

### 5.7 Menutup Aplikasi

- Sebelum keluar, konfirmasi jika masih ada service `running` (opsional:
  tawarkan "Stop semua" atau "Biarkan berjalan").

---

## 6. Fitur (Scope)

### 6.1 MVP — Wajib (v1)

1. CRUD **Projek** (tambah, ubah, hapus).
2. CRUD **Service** (tambah, ubah, hapus) di dalam projek.
3. **Run** service → spawn process di path dengan command tertentu.
4. **Stop** service → kill process tree dengan bersih.
5. **Status** realtime tiap service (stopped/starting/running/error).
6. **Log realtime** (stdout + stderr) per service.
7. **Persistensi** otomatis ke file JSON (projek + service tersimpan).
8. Tombol **Browse** untuk memilih path folder.
9. Tampilan sederhana: daftar projek → daftar service → panel log.

### 6.2 Nice-to-Have (v2, boleh ditunda)

1. Tombol **Run All** / **Stop All** per projek.
2. Deteksi otomatis jika port yang dicatat sudah dipakai (health check).
3. Menandai service `error` otomatis saat proses keluar dengan kode error.
4. Badge jumlah service running di tiap projek.
5. Pencarian / filter projek.
6. Duplikat service / projek (untuk clone konfigurasi cepat).

### 6.3 Out of Scope (untuk sekarang)

- Autostart saat boot.
- Restart otomatis saat crash.
- Menjalankan sebagai daemon terpisah dari aplikasi.
- Multi-user / permission management.

---

## 7. Aturan Proses (Penting)

1. **Spawn process:** jalankan command di direktori `path` menggunakan shell
   (`/bin/bash -c "command"`), agar command seperti `npm run dev` bisa jalan.
2. **Kill process tree:** saat Stop, bunuh parent + child. Gunakan pendekatan
   yang membunuh seluruh grup proses (misal `kill(-pid)` / `process.kill(-pid)`
   atau bantu dengan `pkill -P`), bukan hanya PID parent — karena `npm run dev`
   biasanya spawn child process.
3. **Pemisahan log:** stdout dan stderr digabung per service, tapi tidak
   tercampur antar service.
4. **Banyak service boleh running bersamaan**, termasuk dari projek berbeda.
5. **Port hanya label/info** untuk membantu user, bukan untuk konflik
   (deteksi konflik port adalah v2).
6. **Service `error`:** jika proses berhenti sendiri (exit) dengan kode != 0,
   status menjadi `error` dan tetap tampil di log.

---

## 8. Tampilan / UX

- **Sidebar kiri:** daftar projek.
- **Area tengah:** daftar service dari projek terpilih (nama, path ringkas,
  port, status badge, tombol Run/Stop).
- **Panel bawah / kanan:** log service yang sedang dipilih.

Konsep sederhana satu layar, tidak perlu multi-window. Target: buka aplikasi →
lihat semua → klik Run/Stop.

---

## 9. Kriteria Selesai (Acceptance Criteria)

- [ ] Bisa tambah projek dan service, tersimpan setelah aplikasi ditutup & dibuka lagi.
- [ ] Klik Run → service benar-benar jalan (bisa diakses di port-nya).
- [ ] Klik Stop → proses benar-benar berhenti (tidak ada sisa proses).
- [ ] Log service tampil realtime.
- [ ] Banyak service dari banyak projek bisa jalan bersamaan.
- [ ] Status berubah sesuai kondisi nyata proses.

---

## 10. Catatan Teknis (Saran, bisa disesuaikan)

- **Platform:** Linux desktop.
- **Tech stack (opsi):** Electron + Node.js, atau Tauri + Rust/Node, atau
  framework lain yang nyaman. Karena fiturnya berpusat pada spawn/kill proses
  dan baca log, cukup pakai kemampuan child_process bawaan Node.
- **Penyimpanan:** JSON lokal (belum perlu database).
- **Antarmuka:** sederhana, fokus ke fungsionalitas.

> Bagian tech stack ini hanya saran awal. Bisa diputuskan setelah review PRD.
