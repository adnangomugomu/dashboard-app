'use strict';

const { spawn } = require('node:child_process');
const os = require('node:os');
const { EventEmitter } = require('node:events');

const MAX_BUFFER = 500_000;

/**
 * Menjalankan satu command Linux sekaligus. Output di-stream ke renderer.
 */
class CommandRunner extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.pid = null;
    this.command = null;
    this.buffer = '';
  }

  run(command) {
    this.stop();
    this.buffer = '';
    this.command = command;
    this.emit('start', { command });

    let child;
    try {
      child = spawn(command, {
        shell: true,
        cwd: os.homedir(),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      });
    } catch (err) {
      this.emit('error', { message: err.message });
      return { ok: false, error: err.message };
    }

    this.proc = child;
    this.pid = child.pid;

    const onData = (buf) => {
      const text = buf.toString();
      this.buffer += text;
      if (this.buffer.length > MAX_BUFFER) {
        this.buffer = this.buffer.slice(-Math.floor(MAX_BUFFER * 0.8));
      }
      this.emit('data', text);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      this.emit('error', { message: err.message });
    });

    child.on('exit', (code, signal) => {
      this.proc = null;
      this.pid = null;
      this.emit('exit', { code, signal, command: this.command });
    });

    return { ok: true, pid: child.pid };
  }

  stop() {
    if (!this.proc) return { ok: false, error: 'Tidak ada command yang berjalan.' };

    const pid = this.pid;
    const proc = this.proc;

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        proc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }, 3000);

    return { ok: true };
  }

  clear() {
    this.buffer = '';
  }

  status() {
    return {
      running: Boolean(this.proc),
      pid: this.pid,
      command: this.command,
    };
  }
}

module.exports = CommandRunner;
