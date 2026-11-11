import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = new URL('./', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ...['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_nosimd_internal.js',
    'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.wasm', 'blaze_face_short_range.tflite']
    .map(name => ['/vendor/mediapipe/' + name, ['vendor/mediapipe/' + name,
      name.endsWith('.wasm') ? 'application/wasm' : /\.(mjs|js)$/.test(name) ? 'text/javascript; charset=utf-8' : 'application/octet-stream']])
]);
const policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export function createForestServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', policy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const entry = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
    if (!entry) { response.writeHead(404); response.end('Not found'); return; }
    try {
      const data = await readFile(new URL(entry[0], root));
      response.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': data.length });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch { response.writeHead(500); response.end('A required file is missing.'); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = createForestServer();
  let port = Number(process.env.FOREST_PORT || 4173);
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && port >= 4173 && port < 4183) {
      server.listen(++port, '127.0.0.1');
    } else { console.error(error.message); process.exitCode = 1; }
  });
  server.on('listening', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`Moonlit Forest: ${url}\nKeep this window open. Press Ctrl+C to stop.`);
    if (process.argv.includes('--open')) {
      const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`].find(existsSync);
      if (chrome) {
        const child = spawn(chrome, [url], { detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', error => console.error(`Open Chrome and visit ${url}\n${error.message}`)); child.unref();
      } else console.log(`Open Chrome and visit ${url}`);
    }
  });
  server.listen(port, '127.0.0.1');
}
