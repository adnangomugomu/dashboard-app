'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const MAX_LOG_CHUNKS = 3000;
const KILL_GRACE_MS = 4000;

/**
 * Mengelola proses tiap service: spawn, kill process tree, status, dan log.
 * Status yang mungkin: stopped | running | error
 */
class ProcessManager extends EventEmitter {
  constructor() {
    super();
    this.procs = new Map(); // serviceId -> { child, pid, stopping, killTimer, startedAt }
    this.logs = new Map(); // serviceId -> string[]
    this.restartTimers = new Map(); // serviceId -> timeout (menunggu proses lama mati)
  }

  getStatus(id) {
    return this.procs.has(id) ? 'running' : 'stopped';
  }

  isRunning(id) {
    return this.procs.has(id);
  }

  getLogs(id) {
    return this.logs.get(id) || [];
  }

  clearLogs(id) {
    this.logs.set(id, []);
  }

  appendLog(id, text) {
    if (!text) return;
    const arr = this.logs.get(id) || [];
    arr.push(text);
    if (arr.length > MAX_LOG_CHUNKS) arr.splice(0, arr.length - MAX_LOG_CHUNKS);
    this.logs.set(id, arr);
    this.emit('log', { id, text });
  }

  /**
   * Jalankan service.
   * @param {{id:string, name:string, path:string, command:string}} service
   */
  run(service) {
    if (this.procs.has(service.id)) {
      return { ok: false, error: 'Service sudah berjalan.' };
    }

    // Batalkan restart tertunda kalau ada (mis. user klik Run).
    const pending = this.restartTimers.get(service.id);
    if (pending) {
      clearTimeout(pending);
      this.restartTimers.delete(service.id);
    }

    if (!service.path || !fs.existsSync(service.path)) {
      this.emit('status', { id: service.id, status: 'error', pid: null });
      return { ok: false, error: `Folder tidak ditemukan: ${service.path}` };
    }

    this.appendLog(
      service.id,
      `\n$ ${service.command}\n  cwd: ${service.path}\n\n`
    );

    let child;
    try {
      child = spawn(service.command, {
        cwd: service.path,
        shell: true,
        detached: true, // jadikan leader process group agar bisa kill seluruh tree
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' },
      });
    } catch (err) {
      this.appendLog(service.id, `[gagal menjalankan] ${err.message}\n`);
      this.emit('status', { id: service.id, status: 'error', pid: null });
      return { ok: false, error: err.message };
    }

    const entry = {
      child,
      pid: child.pid,
      stopping: false,
      killTimer: null,
      startedAt: Date.now(),
    };
    this.procs.set(service.id, entry);

    const onData = (buf) => this.appendLog(service.id, buf.toString());
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('error', (err) => {
      this.appendLog(service.id, `\n[error] ${err.message}\n`);
    });

    child.on('exit', (code, signal) => {
      const current = this.procs.get(service.id);
      const wasStopping = current ? current.stopping : false;
      const restartService = current ? current.restartAfterExit : null;
      if (current && current.killTimer) clearTimeout(current.killTimer);
      this.procs.delete(service.id);

      // Restart: tunggu proses lama benar-benar mati, lalu jalankan lagi.
      if (restartService) {
        this.appendLog(
          service.id,
          '\n[restart] proses lama berhenti, menjalankan ulang...\n'
        );
        this.emit('status', { id: service.id, status: 'starting', pid: null });
        const timer = setTimeout(() => {
          this.restartTimers.delete(service.id);
          this.run(restartService);
        }, 400);
        this.restartTimers.set(service.id, timer);
        return;
      }

      if (wasStopping || signal === 'SIGTERM' || signal === 'SIGKILL') {
        this.appendLog(service.id, `\n[berhenti] signal=${signal || code}\n`);
        this.emit('status', { id: service.id, status: 'stopped', pid: null });
      } else if (code === 0) {
        this.appendLog(service.id, '\n[selesai] exit code 0\n');
        this.emit('status', { id: service.id, status: 'stopped', pid: null });
      } else {
        this.appendLog(
          service.id,
          `\n[berhenti tidak normal] exit code ${code} signal ${signal}\n`
        );
        this.emit('status', { id: service.id, status: 'error', pid: null });
      }
    });

    this.emit('status', { id: service.id, status: 'running', pid: child.pid });
    return { ok: true, pid: child.pid };
  }

  restart(service) {
    if (this.restartTimers.has(service.id)) {
      return { ok: true, restarting: true };
    }

    const entry = this.procs.get(service.id);
    if (!entry) {
      this.appendLog(
        service.id,
        '\n[restart] service belum berjalan, menjalankan...\n'
      );
      return this.run(service);
    }

    entry.restartAfterExit = service;
    this.appendLog(service.id, '\n[restart] menghentikan proses lama...\n');
    this.emit('status', { id: service.id, status: 'starting', pid: null });
    return this.stop(service.id);
  }

  stop(id) {
    // Kalau sedang menunggu restart, batalkan saja.
    const pending = this.restartTimers.get(id);
    if (pending) {
      clearTimeout(pending);
      this.restartTimers.delete(id);
      this.appendLog(id, '\n[restart] dibatalkan.\n');
      this.emit('status', { id, status: 'stopped', pid: null });
      return { ok: true };
    }

    const entry = this.procs.get(id);
    if (!entry) return { ok: false, error: 'Service tidak sedang berjalan.' };

    entry.stopping = true;
    const pid = entry.pid;

    // Kill seluruh process group (parent + child di grup yang sama).
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        entry.child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }

    // Paksa mati kalau belum berhenti.
    entry.killTimer = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
      try {
        entry.child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, KILL_GRACE_MS);

    return { ok: true };
  }

  stopAll() {
    const ids = new Set([
      ...this.procs.keys(),
      ...this.restartTimers.keys(),
    ]);
    for (const id of ids) {
      this.stop(id);
    }
  }
}

module.exports = ProcessManager;
