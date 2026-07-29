/**
 * Post-build hardening for the published library manifest.
 *
 * ng-packagr unconditionally stamps a `tslib` runtime dependency into the
 * generated dist package.json. Our library is compiled with
 * `importHelpers: false`, so the FESM bundle inlines TS helpers and never
 * imports tslib (verified in CI). This script removes that unused dependency
 * so the published package has ZERO runtime dependencies (Angular peers only),
 * and asserts the bundle really is tslib-free before doing so.
 *
 * This is a REPO-ROOT build tool. It is NOT a lifecycle script inside the
 * published package — the shipped package.json contains no scripts at all.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist/allomoney-library');
const libDir = resolve(process.cwd(), 'projects/allomoney-library');
const manifestPath = resolve(distDir, 'package.json');
const bundlePath = resolve(distDir, 'fesm2022/allomoney-library.mjs');

// Safety gate: only strip tslib if the bundle genuinely does not use it.
const bundle = readFileSync(bundlePath, 'utf8');
if (bundle.includes('tslib')) {
  console.error(
    '[finalize-package] Bundle references tslib but the manifest strips it. ' +
      'Aborting: either keep tslib as a dependency or fix importHelpers.',
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.dependencies) {
  delete manifest.dependencies.tslib;
  if (Object.keys(manifest.dependencies).length === 0) {
    delete manifest.dependencies;
  }
}

// Guardrail: the published package must never carry install-time scripts.
const forbidden = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];
if (manifest.scripts) {
  for (const key of forbidden) delete manifest.scripts[key];
  if (Object.keys(manifest.scripts).length === 0) delete manifest.scripts;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// ng-packagr copies README.md but not LICENSE. Ship the MIT license alongside
// the package so the tarball is legally complete.
copyFileSync(resolve(libDir, 'LICENSE'), resolve(distDir, 'LICENSE'));

console.log('[finalize-package] Wrote clean manifest + LICENSE (no runtime dependencies).');