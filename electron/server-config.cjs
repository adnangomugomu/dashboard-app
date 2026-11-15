'use strict';

const { app } = require('electron');

/**
 * URL backend yang dipakai aplikasi desktop.
 *
 * - Development (`npm start`, app belum dipaket): URL lokal.
 * - Production (AppImage hasil `npm run build`): URL API.
 * - `ADNANDEV_SERVER_URL` dapat menimpa keduanya (untuk uji coba).
 */
const DEV_URL = 'http://127.0.0.1:3002';
const PROD_URL = 'https://api-myweddingapp.adnandev.com';

function info() {
  const override = (process.env.ADNANDEV_SERVER_URL || '').trim();
  const paksa = (process.env.ADNANDEV_MODE || '').trim().toLowerCase();
  const isPackaged = paksa
    ? paksa === 'production'
    : Boolean(app && app.isPackaged);

  if (override) {
    return { url: override, mode: 'override', isPackaged };
  }

  return {
    url: isPackaged ? PROD_URL : DEV_URL,
    mode: isPackaged ? 'production' : 'development',
    isPackaged,
  };
}

/** Label pendek untuk ditampilkan di UI. */
function modeLabel(mode) {
  if (mode === 'production') return 'Production';
  if (mode === 'development') return 'Development';
  return 'Kustom';
}

module.exports = { info, modeLabel, DEV_URL, PROD_URL };
