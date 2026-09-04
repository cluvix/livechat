// story-10: static file server nhỏ cho smoke test — KHÔNG thêm dependency (dùng thẳng node:http). Phục vụ
// 2 vai trò tách biệt trong tests/smoke.spec.ts:
//   - port 5600 (root = ../dist): widget.js + widget.html build thật (đúng kiến trúc — widget bundle KHÔNG
//     mock, chỉ API/SSE mock qua page.route()).
//   - port 5601 (root = tests/fixtures): trang khách giả (host.html) — origin KHÁC port 5600 để đúng mô
//     hình cross-origin thật (loader.ts §1: Origin trang khách ≠ Origin backend Cluvix).
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

export function startStaticServer(rootDir: string, port: number, host = '127.0.0.1'): Promise<Server> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
          const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
          const filePath = join(rootDir, safePath === '/' || safePath === '' ? '/index.html' : safePath);
          const buf = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
          res.end(buf);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found');
        }
      })();
    });
    server.on('error', reject);
    server.listen(port, host, () => resolvePromise(server));
  });
}

export function stopServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((err) => (err ? reject(err) : resolvePromise()));
  });
}
