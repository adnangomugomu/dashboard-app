'use strict';

/**
 * Konfigurasi fitur "Monitoring Layar".
 *
 * Token perangkat ini hanya dipakai aplikasi desktop (bukan aplikasi Flutter)
 * untuk memanggil endpoint `/monitor/desktop/*` di backend. Token disimpan di
 * database sebagai SHA-256, jadi nilai plaintext di bawah ini adalah satu-
 * satunya salinan yang bisa dipakai.
 *
 * Catatan keamanan: ini aplikasi pribadi yang hanya berjalan di komputer
 * sendiri. Bila repo ini pernah dibagikan, ganti tokennya (buat hash baru di
 * tabel `monitor_token`, lalu perbarui nilai di sini).
 */
const MONITOR_CONFIG = {
  // Backend NestJS. Emulator Android memakai 10.0.2.2, desktop cukup localhost.
  apiBaseUrl: process.env.ADNANDEV_MONITOR_API || 'http://127.0.0.1:3002',

  // Token perangkat (lihat tabel monitor_token, nama "Komputer Adnan").
  token: 'bbf00a0a3ba2bad03ac1def6642438fa94482d9777a4e3fe',

  // Interval polling job screenshot.
  pollIntervalMs: 2000,

  // Timeout satu permintaan HTTP ke backend.
  requestTimeoutMs: 20000,
};

module.exports = MONITOR_CONFIG;
