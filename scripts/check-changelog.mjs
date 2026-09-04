// story-10 AC5: release.yml gọi script này trước khi build/publish — fail nếu CHANGELOG.md chưa có mục cho
// version đang release (tránh tag ra ngoài mà changelog quên cập nhật). Version lấy từ arg CLI (tag đã bỏ
// tiền tố `v`, vd release.yml truyền `1.2.3`) — không tự đoán từ git tag ở đây để script test được độc lập.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const changelogPath = resolve(here, '../CHANGELOG.md');

const version = (process.argv[2] || '').trim().replace(/^v/, '');
if (!version) {
  console.error('  ✗ thiếu tham số version. Dùng: node scripts/check-changelog.mjs <version>  (vd 1.2.3)');
  process.exit(1);
}

const changelog = readFileSync(changelogPath, 'utf8');
// Keep a Changelog format: "## [1.2.3]" (heading có thể kèm ngày, vd "## [1.2.3] - 2026-09-03").
const heading = new RegExp(`^##\\s*\\[${escapeRegExp(version)}\\]`, 'm');
if (!heading.test(changelog)) {
  console.error(`  ✗ CHANGELOG.md thiếu mục cho version ${version} (cần dòng "## [${version}]")`);
  process.exit(1);
}
console.log(`  ✓ CHANGELOG.md có mục cho version ${version}`);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
