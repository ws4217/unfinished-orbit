import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = existsSync(path.join(directory, 'src', 'main.ts')) ? path.join(directory, 'dist') : directory;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

try {
  await stat(path.join(root, 'index.html'));
} catch {
  console.error('找不到构建文件。开发目录请先运行 npm run build；本地包请完整解压后运行。');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(403).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
const port = Number(process.env.ORBIT_PORT ?? process.env.PORT ?? 4217);
const host = process.env.ORBIT_HOST ?? '127.0.0.1';
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口${port}已被占用，请关闭原服务后重试；不会自动切换端口。`
    : `本地服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  const { address, port } = server.address();
  const urlHost = address.includes(':') ? `[${address}]` : address;
  console.log(`未完成的轨道：http://${urlHost}:${port}/`);
});
