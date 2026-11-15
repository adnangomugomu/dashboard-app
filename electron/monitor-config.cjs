'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Konfigurasi fitur "Monitoring Layar".
 *
 * Token perangkat TIDAK ditanam di repo (repo ini publik). Urutan pembacaan:
 *   1. process.env.ADNANDEV_MONITOR_TOKEN
 *   2. file lokal `monitor-token.txt` di folder userData aplikasi
 *      (mis. ~/.config/ADNANDEV-APP/monitor-token.txt, permission 600)
 *
 * Bila token belum ada, fitur monitoring tetap mati dengan tenang (tidak
 * mengganggu fitur lain) dan alasannya dicatat di console.
 */
function bacaToken() {
  const dariEnv = (process.env.ADNANDEV_MONITOR_TOKEN || '').trim();
  if (dariEnv) return dariEnv;

  try {
    // app.getPath('userData') butuh Electron; dibaca lazy agar modul ini bisa
    // di-require sebelum app siap.
    const { app } = require('electron');
    const file = path.join(app.getPath('userData'), 'monitor-token.txt');
    if (fs.existsSync(file)) {
      const isi = fs.readFileSync(file, 'utf8').trim();
      if (isi) return isi;
    }
    return null;
  } catch {
    return null;
  }
}

const MONITOR_CONFIG = {
  // Backend NestJS. Emulator Android memakai 10.0.2.2, desktop cukup localhost.
  apiBaseUrl: process.env.ADNANDEV_MONITOR_API || 'http://127.0.0.1:3002',

  // Diisi saat runtime lewat bacaToken(); null = fitur nonaktif.
  get token() {
    return bacaToken();
  },

  // Interval polling job screenshot.
  pollIntervalMs: 2000,

  // Timeout satu permintaan HTTP ke backend.
  requestTimeoutMs: 20000,
};

module.exports = MONITOR_CONFIG;
