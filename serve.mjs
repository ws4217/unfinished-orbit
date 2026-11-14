import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.basename(directory) === 'dist' ? directory : path.join(directory, 'dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
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
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? '端口4217已被占用，请关闭原服务后重试；不会自动切换端口。'
    : `本地服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(4217, '127.0.0.1', () => {
  console.log('未竟之轨：http://127.0.0.1:4217/（关闭此进程即可停止）');
});
