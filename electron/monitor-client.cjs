'use strict';

const { EventEmitter } = require('node:events');
const { desktopCapturer, screen } = require('electron');
const MONITOR_CONFIG = require('./monitor-config.cjs');

/**
 * MonitorClient — jembatan antara backend NestJS dan layar komputer.
 *
 * Alur (opsi polling, tanpa dialog):
 *   1. Setiap `pollIntervalMs`, desktop memanggil POST /monitor/desktop/klaim
 *      memakai token perangkat.
 *   2. Bila ada job, desktop menangkap layar utama (full resolusi, PNG) lalu
 *      mengunggahnya ke POST /monitor/desktop/capture/:id.
 *   3. Bila gagal, desktop melapor ke POST /monitor/desktop/gagal/:id.
 *
 * Semua langkah berjalan di main process, jadi tetap bekerja walau window
 * aplikasi sedang disembunyikan ke system tray.
 */
class MonitorClient extends EventEmitter {
  constructor(config = MONITOR_CONFIG) {
    super();
    this.config = config;
    this.timer = null;
    this.sibuk = false;
    this.berhenti = false;
    this.terakhirError = null;
    this.status = {
      aktif: false,
      backend: 'belum-terhubung',
      lastPollAt: null,
      lastCaptureAt: null,
      error: null,
    };
  }

  get headers() {
    return {
      'x-monitor-token': this.config.token,
      Accept: 'application/json',
    };
  }

  start() {
    if (this.timer || this.status.aktif) return;

    if (!this.config.token) {
      this.status.aktif = false;
      this.status.backend = 'tanpa-token';
      this.status.error = 'Token perangkat belum diatur (monitor-token.txt)';
      console.warn(
        '[monitor-layar] token perangkat belum diatur; fitur monitoring nonaktif'
      );
      this.emit('offline', { ...this.status });
      return;
    }

    this.berhenti = false;
    this.status.aktif = true;
    this.emit('start', { ...this.status });
    this._loop();
  }

  stop() {
    this.berhenti = true;
    this.status.aktif = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit('stop', { ...this.status });
  }

  info() {
    return { ...this.status };
  }

  _loop() {
    if (this.berhenti) return;
    this._tick()
      .catch((err) => this._catatError(err))
      .finally(() => {
        if (this.berhenti) return;
        this.timer = setTimeout(() => this._loop(), this.config.pollIntervalMs);
      });
  }

  async _tick() {
    if (this.sibuk) return;
    this.sibuk = true;

    try {
      const res = await this._post('/monitor/desktop/klaim');
      this._tandaiTerhubung();

      const job = res && res.data;
      if (!job || !job.id) return;

      this.emit('job', { id: job.id });
      await this._kerjakan(job.id);
    } finally {
      this.sibuk = false;
    }
  }

  async _kerjakan(id) {
    let hasil;
    try {
      hasil = await this._tangkapLayarUtama();
    } catch (err) {
      await this._laporGagal(id, `Gagal menangkap layar: ${err.message}`);
      return;
    }

    try {
      await this._unggah(id, hasil);
      this.status.lastCaptureAt = new Date().toISOString();
      this.emit('captured', {
        id,
        lebar: hasil.lebar,
        tinggi: hasil.tinggi,
        ukuran: hasil.png.length,
      });
    } catch (err) {
      await this._laporGagal(id, `Gagal mengunggah screenshot: ${err.message}`);
    }
  }

  /** Tangkap layar utama sebagai PNG full resolusi (tanpa dialog). */
  async _tangkapLayarUtama() {
    const utama = screen.getPrimaryDisplay();
    const lebar = Math.max(1, Math.round(utama.size.width * utama.scaleFactor));
    const tinggi = Math.max(1, Math.round(utama.size.height * utama.scaleFactor));

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: lebar, height: tinggi },
      fetchWindowIcons: false,
    });

    if (!sources.length) throw new Error('tidak ada layar yang terdeteksi');

    const cocok =
      sources.find((s) => String(s.display_id) === String(utama.id)) || sources[0];

    const gambar = cocok.thumbnail;
    if (!gambar || gambar.isEmpty()) throw new Error('hasil tangkapan kosong');

    const png = gambar.toPNG();
    const ukuran = gambar.getSize();

    return { png, lebar: ukuran.width, tinggi: ukuran.height };
  }

  async _unggah(id, hasil) {
    const form = new FormData();
    form.append('file', new Blob([hasil.png], { type: 'image/png' }), 'screenshot.png');

    const res = await fetch(`${this.config.apiBaseUrl}/monitor/desktop/capture/${id}`, {
      method: 'POST',
      headers: this.headers, // jangan set Content-Type: biar fetch mengatur boundary
      body: form,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!res.ok) {
      throw new Error(`backend menolak (${res.status})`);
    }
  }

  async _laporGagal(id, pesan) {
    try {
      await fetch(`${this.config.apiBaseUrl}/monitor/desktop/gagal/${id}`, {
        method: 'POST',
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pesan: String(pesan).slice(0, 255) }),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch {
      // Abaikan: laporan gagal yang gagal tidak boleh menghentikan polling.
    }
    this._catatError(new Error(pesan));
    this.emit('failed', { id, pesan });
  }

  async _post(path) {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (res.status === 401) {
      throw new Error('token perangkat ditolak backend');
    }
    if (!res.ok) {
      throw new Error(`backend membalas ${res.status}`);
    }

    return res.json();
  }

  _tandaiTerhubung() {
    const pulih = this.status.backend !== 'terhubung';
    this.status.backend = 'terhubung';
    this.status.lastPollAt = new Date().toISOString();
    this.status.error = null;
    this.terakhirError = null;
    if (pulih) this.emit('online', { ...this.status });
  }

  _catatError(err) {
    const pesan = err && err.message ? err.message : String(err);
    this.status.backend = 'gagal';
    this.status.error = pesan;

    // Hindari spam log saat backend mati: hanya cetak bila pesannya berubah.
    if (this.terakhirError !== pesan) {
      this.terakhirError = pesan;
      console.warn('[monitor-layar]', pesan);
      this.emit('offline', { ...this.status });
    }
  }
}

module.exports = MonitorClient;
