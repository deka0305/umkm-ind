/**
 * Build web app (expo export) lalu bundle semua file hasilnya ke dalam
 * lib/webdist.generated.ts agar bisa di-serve oleh HTTP server lokal di HP.
 *
 * Jalankan: npm run build:webdist
 * Wajib diulang setiap kali kode app berubah agar web yang di-serve HP ikut terbaru.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_NATIVE = path.join(ROOT, 'lib', 'webdist.generated.ts');
const OUT_WEB = path.join(ROOT, 'lib', 'webdist.generated.web.ts');

const TEXT_EXTS = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg', '.xml']);
const SKIP_EXTS = new Set(['.map']);

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const STUB = `// AUTO-GENERATED — stub untuk platform web agar bundle web tidak
// ikut membawa salinan dirinya sendiri (rekursif). JANGAN EDIT MANUAL.
export interface WebDistFile { mime: string; encoding: 'utf8' | 'base64'; data: string }
export const WEBDIST: Record<string, WebDistFile> = {};
`;

function walk(dir, base = '') {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base + '/' + name;
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

// 1. Tulis stub web DULU supaya hasil export tidak mengandung WEBDIST lama
fs.writeFileSync(OUT_WEB, STUB);
if (!fs.existsSync(OUT_NATIVE)) {
  fs.writeFileSync(OUT_NATIVE, STUB.replace(' — stub untuk platform web', ' — placeholder'));
}

// 2. Export web build
console.log('› expo export --platform web ...');
execSync('npx expo export --platform web', { cwd: ROOT, stdio: 'inherit' });

// 3. Bundle semua file dist/ ke modul TS
const files = walk(DIST).filter(({ rel }) => !SKIP_EXTS.has(path.extname(rel)));
let totalBytes = 0;
const entries = files.map(({ full, rel }) => {
  const ext = path.extname(rel).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(full);
  totalBytes += buf.length;
  const isText = TEXT_EXTS.has(ext);
  const data = isText ? buf.toString('utf8') : buf.toString('base64');
  return `  ${JSON.stringify(rel)}: { mime: ${JSON.stringify(mime)}, encoding: '${isText ? 'utf8' : 'base64'}', data: ${JSON.stringify(data)} }`;
});

const header = `// AUTO-GENERATED oleh scripts/pack-webdist.js — JANGAN EDIT MANUAL.
// Berisi hasil "expo export --platform web" untuk di-serve server HTTP lokal HP.
// Regenerate dengan: npm run build:webdist
export interface WebDistFile { mime: string; encoding: 'utf8' | 'base64'; data: string }
export const WEBDIST: Record<string, WebDistFile> = {
`;
fs.writeFileSync(OUT_NATIVE, header + entries.join(',\n') + '\n};\n');

console.log(`✓ ${files.length} file (${(totalBytes / 1024 / 1024).toFixed(1)} MB) → lib/webdist.generated.ts`);
