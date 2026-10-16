import http from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resumeSchema } from '../src/schema.ts';
import { ResumeStore } from './store.mjs';
import { importResumeFile, MAX_IMPORT_BYTES } from './import-file.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const development = process.argv.includes('--dev');
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须是 1024 到 65535 之间的整数');
const origin = `http://127.0.0.1:${port}`;
const store = new ResumeStore(resolve(process.env.RESUME_DATA_DIR || join(root, 'data')));
const printJobs = new Map();
const chromeCandidates = [process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chromePath = chromeCandidates.find(path => existsSync(path));
const vite = development ? await (await import('vite')).createServer({
  configFile: join(root, 'vite.config.ts'), root, server: { middlewareMode: true, hmr: false }, appType: 'spa',
}) : null;

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw Object.assign(new Error('请求必须为 JSON'), { status: 415 });
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw Object.assign(new Error('内容超过 8 MB，请缩小照片或减少内容'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw Object.assign(new Error('JSON 格式不正确'), { status: 400 }); }
}

let importController = null;
async function importFile(request, response, filename) {
  if (importController) return json(response, 429, { error: '另一份文件正在识别，请稍后再试。' });
  if (!/\.(docx?|pdf)$/i.test(filename)) return json(response, 400, { error: '请选择 Word（.docx、.doc）或 PDF 文件。' });
  if (Number(request.headers['content-length']) > MAX_IMPORT_BYTES) return json(response, 413, { error: '文件超过 20 MB，请压缩图片或减少页数后再导入。' });
  const controller = new AbortController();
  response.once('close', () => { controller.abort(); if (importController === controller) importController = null; });
  importController = controller;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_IMPORT_BYTES) return json(response, 413, { error: '文件超过 20 MB，请压缩图片或减少页数后再导入。' });
      chunks.push(chunk);
    }
    // 导入只返回识别结果，用户点击“导入并排版”后才保存为一份新简历。
    const result = await importResumeFile(Buffer.concat(chunks), filename, { cacheDirectory: join(store.directory, '.cache'), signal: controller.signal });
    if (!controller.signal.aborted) json(response, 200, result);
  } catch (error) {
    if (error.name !== 'AbortError' && !controller.signal.aborted) json(response, 422, { error: error.message || '文件识别失败，请检查文件是否完整。' });
  } finally { if (importController === controller) importController = null; }
}

let exporting = false;
async function exportPdf(document, response) {
  if (!chromePath) throw Object.assign(new Error('未找到 Chrome 或 Edge。请安装浏览器，或使用“浏览器打印”。也可通过 CHROME_PATH 指定浏览器路径。'), { status: 503 });
  if (exporting) throw Object.assign(new Error('另一份 PDF 正在生成，请稍后重试'), { status: 429 });
  exporting = true;
  const token = crypto.randomUUID();
  printJobs.set(token, document);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    // 导出只允许访问本地页面，简历内容和照片不会发往外部网站。
    await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('data:')
      ? route.continue() : route.abort());
    await page.goto(`${origin}/?print=${token}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => window.__resumeReady === true, undefined, { timeout: 30000 });
    await page.emulateMedia({ media: 'print' });
    const overflow = await page.locator('.sheet-content').evaluateAll(elements => elements.some(element => element.scrollHeight > element.clientHeight + 2));
    if (overflow) throw new Error('检测到页面内容溢出，请调整排版后重试');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, timeout: 30000 });
    response.writeHead(200, {
      'Content-Type': 'application/pdf', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(`${document.profile.name || document.title}-简历.pdf`)}`,
    });
    response.end(pdf);
  } finally {
    printJobs.delete(token);
    if (browser) await browser.close();
    exporting = false;
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  if (!development) response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!allowedHosts.includes(request.headers.host)) return json(response, 403, { error: '仅允许本机访问' });
    if (request.headers.origin && !allowedHosts.some(host => request.headers.origin === `http://${host}`)) {
      return json(response, 403, { error: '不接受其他网站发起的请求' });
    }
    const url = new URL(request.url, origin);
    if (url.pathname === '/api/health') return json(response, 200, { ok: true, service: 'resume-studio', pdfAvailable: Boolean(chromePath), localOnly: true });
    if (url.pathname === '/api/import' && request.method === 'POST') return await importFile(request, response, url.searchParams.get('filename') || '');
    if (url.pathname === '/api/resumes' && request.method === 'GET') return json(response, 200, { documents: await store.list() });
    if (url.pathname === '/api/resumes' && request.method === 'POST') {
      const parsed = resumeSchema.safeParse(await body(request));
      if (!parsed.success) return json(response, 400, { error: '简历数据格式不正确或内容过长', details: parsed.error.issues.map(issue => issue.path.join('.')).slice(0, 5) });
      return json(response, 200, { document: await store.save(parsed.data) });
    }
    if (url.pathname.startsWith('/api/resumes/') && request.method === 'DELETE') {
      await store.remove(url.pathname.slice('/api/resumes/'.length));
      return json(response, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/print/') && request.method === 'GET') {
      const document = printJobs.get(url.pathname.slice('/api/print/'.length));
      return json(response, document ? 200 : 404, document ? { document } : { error: '打印任务已过期' });
    }
    if (url.pathname === '/api/export/pdf' && request.method === 'POST') {
      const parsed = resumeSchema.safeParse(await body(request));
      if (!parsed.success) return json(response, 400, { error: '简历数据格式不正确' });
      return await exportPdf(parsed.data, response);
    }
    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: '接口不存在' });
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: '不支持此请求' });
    if (vite) return vite.middlewares(request, response, () => json(response, 404, { error: '页面不存在' }));
    const publicRoot = join(root, 'dist');
    const file = resolve(publicRoot, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(`${publicRoot}${sep}`)) return json(response, 403, { error: '路径无效' });
    let bytes;
    try { bytes = await readFile(file); }
    catch (error) {
      if (error.code === 'ENOENT') return json(response, 404, { error: '未找到页面，请先运行 npm run build' });
      throw error;
    }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    console.error(error.message);
    if (!response.headersSent) json(response, error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.message || '本地服务发生错误' });
    else response.end();
  }
});
server.requestTimeout = 90000;
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可使用 PORT=4318 npm start 更换端口。` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`简历工坊已启动：${origin}\n数据目录：${store.directory}\nPDF 导出：${chromePath ? '可用' : '请安装 Chrome，或使用浏览器打印'}`);
  // 服务就绪后再打开页面，避免首次加载解析依赖时浏览器连接失败。
  if (process.env.RESUME_OPEN_BROWSER === '1' && process.platform === 'darwin') {
    execFile('open', [origin], error => { if (error) console.error(`请在浏览器打开 ${origin}`); });
  }
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  await vite?.close();
  server.close(() => process.exit(0));
});
