'use strict';

/**
 * Menyiapkan versi sebelum build.
 *
 * Aturan:
 * - Jika versi di package.json SAMA dengan versi build terakhir, patch dinaikkan
 *   (contoh 1.0.0 -> 1.0.1).
 * - Jika versi diubah manual (beda dengan build terakhir), versi itu dipakai
 *   apa adanya. Build berikutnya akan increment patch dari situ.
 *
 * State build terakhir disimpan di .last-build-version.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const statePath = path.join(root, '.last-build-version');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function bumpPatch(version) {
  const parts = String(version).split('.').map(Number);
  if (
    parts.length !== 3 ||
    parts.some((n) => !Number.isInteger(n) || n < 0)
  ) {
    throw new Error(`Format versi tidak valid: ${version}`);
  }
  parts[2] += 1;
  return parts.join('.');
}

const pkg = readJson(pkgPath);
const current = pkg.version;
const last = fs.existsSync(statePath)
  ? fs.readFileSync(statePath, 'utf8').trim()
  : '';

if (last && last === current) {
  const next = bumpPatch(current);
  pkg.version = next;
  writeJson(pkgPath, pkg);

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = next;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = next;
    }
    writeJson(lockPath, lock);
  }

  console.log(`[version] ${current} -> ${next}`);
} else if (last && last !== current) {
  console.log(`[version] Versi diubah manual: ${last} -> ${current}`);
} else {
  console.log(`[version] Build pertama: ${current}`);
}

fs.writeFileSync(statePath, pkg.version + '\n');
console.log(`[version] Build v${pkg.version}`);
