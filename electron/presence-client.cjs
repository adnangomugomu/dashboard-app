'use strict';

const { EventEmitter } = require('node:events');
const { io } = require('socket.io-client');
const serverConfig = require('./server-config.cjs');

/**
 * PresenceClient — membuat aplikasi desktop ikut terhitung sebagai
 * "pengguna aktif" di aplikasi wedding.
 *
 * Gateway `/presence` di backend menghitung satu koneksi Socket.IO sebagai
 * satu aplikasi yang sedang terbuka (lihat presence.gateway.ts). Desktop
 * hanya perlu terhubung selama aplikasi berjalan — termasuk saat window
 * disembunyikan ke system tray.
 */
class PresenceClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.status = {
      aktif: false,
      terhubung: false,
      url: null,
      error: null,
    };
  }

  start() {
    if (this.socket) return;

    const { url } = serverConfig.info();
    this.status.url = url;

    try {
      this.socket = io(`${url}/presence`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 15000,
        timeout: 8000,
      });
    } catch (err) {
      this._catatError(err && err.message ? err.message : String(err));
      return;
    }

    this.status.aktif = true;

    this.socket.on('connect', () => {
      this.status.terhubung = true;
      this.status.error = null;
      console.log('[presence] terhubung sebagai aplikasi desktop');
      this.emit('connected', { ...this.status });
    });

    this.socket.on('disconnect', (alasan) => {
      this.status.terhubung = false;
      console.log(`[presence] terputus (${alasan})`);
      this.emit('disconnected', { ...this.status });
    });

    this.socket.on('connect_error', (err) => {
      this._catatError(err && err.message ? err.message : 'gagal terhubung');
    });

    // Minta hitungan terbaru setiap kali (re)connect berhasil.
    this.socket.on('connect', () => {
      this.socket.emit('presence:request');
    });
  }

  stop() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.status.aktif = false;
    this.status.terhubung = false;
  }

  info() {
    return { ...this.status };
  }

  _catatError(pesan) {
    this.status.terhubung = false;
    if (this.status.error === pesan) return;
    this.status.error = pesan;
    console.warn('[presence]', pesan);
    this.emit('offline', { ...this.status });
  }
}

module.exports = PresenceClient;
