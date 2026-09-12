// Runs the web copy on this machine, exactly as Vercel would: public/ served
// statically, /api/* handled by api/[...path].js, the snapshot kept in a file.
// Lets the desktop's « مزامنة الآن » be tried end to end before deploying.
//   WEB_PASSWORD=... SYNC_TOKEN=... node scripts/web-local.js   (port 3790)
// Then, in the desktop settings: URL http://127.0.0.1:3790/api/sync + the token.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const handler = require('../api/[...path].js');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const port = Number(process.env.WEB_PORT) || 3790;
process.env.WEB_SNAPSHOT_FILE ||= path.join(root, 'database', 'web-snapshot.json');
process.env.WEB_PASSWORD ||= 'web';
process.env.SYNC_TOKEN ||= 'sync';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) return handler(req, res);
  const file = path.normalize(path.join(publicDir, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`النسخة للعرض فقط: http://127.0.0.1:${port}  (المستخدم: ${process.env.WEB_USERNAME || 'admin'}, كلمة المرور: ${process.env.WEB_PASSWORD}, رمز المزامنة: ${process.env.SYNC_TOKEN})`);
  console.log(`رابط المزامنة في تطبيق سطح المكتب: http://127.0.0.1:${port}/api/sync`);
});
