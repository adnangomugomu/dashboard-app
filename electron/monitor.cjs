'use strict';

const os = require('node:os');
const { EventEmitter } = require('node:events');

let pty = null;
try {
  pty = require('node-pty');
} catch (err) {
  console.error('[monitor] node-pty tidak tersedia:', err.message);
}

const MAX_BUFFER = 2_000_000;

/**
 * Menjalankan btop di pseudo-terminal (PTY) agar tampilan TUI-nya bisa
 * dirender oleh xterm.js di renderer.
 */
class MonitorManager extends EventEmitter {
  constructor() {
    super();
    this.term = null;
    this.buffer = '';
    this.lastError = null;
    this.command = process.env.ADNANDEV_BTOP || 'btop';
  }

  start(cols = 120, rows = 40) {
    if (this.term) return { ok: true, running: true, pid: this.term.pid };

    if (!pty) {
      this.lastError = 'node-pty tidak tersedia. Jalankan rebuild native module.';
      return { ok: false, error: this.lastError };
    }

    try {
      const parentPid = process.pid;
      // Watchdog: matikan btop (dan process group-nya) kalau proses induk
      // (Electron) hilang, termasuk saat aplikasi di-kill paksa.
      const script = `
        ( while kill -0 ${parentPid} 2>/dev/null && kill -0 $$ 2>/dev/null; do sleep 2; done; kill -TERM -$$ 2>/dev/null ) &
        exec ${this.command}
      `;

      this.term = pty.spawn('/bin/bash', ['-c', script], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: os.homedir(),
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (err) {
      this.term = null;
      this.lastError = `Gagal menjalankan ${this.command}: ${err.message}`;
      return { ok: false, error: this.lastError };
    }

    this.lastError = null;
    this.buffer = '';

    this.term.onData((data) => {
      this.buffer += data;
      if (this.buffer.length > MAX_BUFFER) {
        this.buffer = this.buffer.slice(-Math.floor(MAX_BUFFER * 0.75));
      }
      this.emit('data', data);
    });

    this.term.onExit(({ exitCode, signal }) => {
      this.term = null;
      this.emit('exit', { exitCode, signal });
    });

    return { ok: true, running: true, pid: this.term.pid };
  }

  write(data) {
    if (this.term) this.term.write(data);
  }

  resize(cols, rows) {
    if (!this.term) return;
    try {
      this.term.resize(Math.max(20, cols), Math.max(8, rows));
    } catch {
      /* ignore */
    }
  }

  stop() {
    if (!this.term) return;
    const term = this.term;
    this.term = null;
    try {
      term.kill();
    } catch {
      /* ignore */
    }
  }

  status() {
    return {
      running: Boolean(this.term),
      pid: this.term ? this.term.pid : null,
      error: this.lastError,
    };
  }
}

module.exports = MonitorManager;
