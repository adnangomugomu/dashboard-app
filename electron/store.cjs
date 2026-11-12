'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_BACKUPS = 20;

/**
 * Penyimpanan konfigurasi projek & service dalam satu file JSON.
 * Struktur: { projects: [ { id, name, createdAt, services: [ ... ] } ] }
 *
 * Setiap kali menyimpan, isi file lama otomatis dibackup ke folder `backups/`
 * (maksimal MAX_BACKUPS file terakhir). Jika file utama rusak, backup terbaru
 * dipakai sebagai fallback.
 */
class Store {
  constructor(file) {
    this.file = file;
    this.data = { projects: [] };
    this.load();
  }

  get backupsDir() {
    return path.join(path.dirname(this.file), 'backups');
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      };
    } catch {
      const recovered = this.loadLatestBackup();
      if (recovered) {
        this.data = recovered;
        this.write();
        console.log('[store] config rusak, dipulihkan dari backup terbaru');
      } else {
        this.data = { projects: [] };
        this.write();
      }
    }
  }

  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  save() {
    this.backupCurrent();
    this.write();
  }

  backupCurrent() {
    try {
      if (!fs.existsSync(this.file)) return;
      const current = fs.readFileSync(this.file, 'utf8');
      if (!current.trim()) return;

      // Jangan backup file yang rusak.
      try {
        JSON.parse(current);
      } catch {
        return;
      }

      fs.mkdirSync(this.backupsDir, { recursive: true });
      const files = this.listBackups();

      const latest = files[files.length - 1];
      if (latest) {
        const latestContent = fs.readFileSync(
          path.join(this.backupsDir, latest),
          'utf8'
        );
        if (latestContent === current) return;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(
        path.join(this.backupsDir, `config-${stamp}.json`),
        current,
        'utf8'
      );

      const all = this.listBackups();
      for (const name of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) {
        fs.rmSync(path.join(this.backupsDir, name), { force: true });
      }
    } catch (err) {
      console.error('[store] gagal membuat backup:', err.message);
    }
  }

  listBackups() {
    try {
      return fs
        .readdirSync(this.backupsDir)
        .filter((name) => /^config-.*\.json$/.test(name))
        .sort();
    } catch {
      return [];
    }
  }

  loadLatestBackup() {
    for (const name of this.listBackups().reverse()) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(this.backupsDir, name), 'utf8')
        );
        if (Array.isArray(parsed.projects)) {
          return { projects: parsed.projects };
        }
      } catch {
        /* coba backup berikutnya */
      }
    }
    return null;
  }

  getData() {
    return this.data;
  }

  getProject(id) {
    return this.data.projects.find((p) => p.id === id) || null;
  }

  addProject(name) {
    const project = {
      id: randomUUID(),
      name: String(name).trim(),
      createdAt: new Date().toISOString(),
      services: [],
    };
    this.data.projects.push(project);
    this.save();
    return project;
  }

  updateProject(id, patch) {
    const project = this.getProject(id);
    if (!project) return null;
    if (patch.name != null) project.name = String(patch.name).trim();
    this.save();
    return project;
  }

  deleteProject(id) {
    const idx = this.data.projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.projects.splice(idx, 1);
    this.save();
    return true;
  }

  findService(id) {
    for (const project of this.data.projects) {
      const service = project.services.find((s) => s.id === id);
      if (service) return { ...service, projectId: project.id };
    }
    return null;
  }

  addService(projectId, data) {
    const project = this.getProject(projectId);
    if (!project) return null;

    const service = {
      id: randomUUID(),
      name: String(data.name).trim(),
      path: String(data.path).trim(),
      command: String(data.command).trim(),
      port: data.port ? Number(data.port) : null,
      link: data.link ? String(data.link).trim() : null,
      createdAt: new Date().toISOString(),
    };
    project.services.push(service);
    this.save();
    return service;
  }

  updateService(id, patch) {
    const found = this.findService(id);
    if (!found) return null;
    const project = this.getProject(found.projectId);
    const service = project.services.find((s) => s.id === id);
    if (patch.name != null) service.name = String(patch.name).trim();
    if (patch.path != null) service.path = String(patch.path).trim();
    if (patch.command != null) service.command = String(patch.command).trim();
    if (patch.port !== undefined) {
      service.port = patch.port ? Number(patch.port) : null;
    }
    if (patch.link !== undefined) {
      service.link = patch.link ? String(patch.link).trim() : null;
    }
    this.save();
    return service;
  }

  deleteService(id) {
    const found = this.findService(id);
    if (!found) return false;
    const project = this.getProject(found.projectId);
    project.services = project.services.filter((s) => s.id !== id);
    this.save();
    return true;
  }

  replaceData(parsed) {
    this.data = {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
    this.save();
    return this.data;
  }
}

module.exports = Store;
