// Kiểm tra kích thước bundle (AC1: gzip < 50KB). Đo widget.js + widget.html trong public/ repo cha.
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../../../public');
const files = ['widget.js', 'widget.html'];
const LIMIT = 50 * 1024;

let totalGz = 0;
let missing = false;
for (const f of files) {
  const p = resolve(pub, f);
  if (!existsSync(p)) {
    console.log(`  ✗ thiếu ${f} (chạy npm run build:widget trước)`);
    missing = true;
    continue;
  }
  const buf = readFileSync(p);
  const gz = gzipSync(buf).length;
  totalGz += gz;
  console.log(`  ${f.padEnd(14)} raw ${kb(buf.length).padStart(9)}   gzip ${kb(gz).padStart(9)}`);
}
if (missing) process.exit(1);

console.log(`  ${'TỔNG gzip'.padEnd(14)} ${''.padStart(9)}        ${kb(totalGz).padStart(9)}  (giới hạn ${kb(LIMIT)})`);
if (totalGz > LIMIT) {
  console.log('  ✗ VƯỢT giới hạn 50KB gzip');
  process.exit(1);
}
console.log('  ✓ trong giới hạn 50KB gzip');

function kb(n) {
  return (n / 1024).toFixed(2) + ' KB';
}
