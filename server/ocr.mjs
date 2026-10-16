import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'ocr.swift');
let compilation;
async function binaryPath(cacheDirectory) {
  if (process.platform !== 'darwin') throw new Error('扫描版 PDF 的本机识别目前支持 macOS，请使用文字版 PDF 或 Word 文件。');
  if (!compilation) compilation = (async () => {
    const source = await readFile(sourcePath);
    const digest = createHash('sha256').update(source).digest('hex').slice(0, 12);
    await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
    const path = join(cacheDirectory, `resume-ocr-${digest}`);
    try { await stat(path); return path; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await run('/usr/bin/swiftc', [sourcePath, '-O', '-o', path, '-module-cache-path', join(cacheDirectory, 'swift-modules')], { timeout: 90000, maxBuffer: 1024 * 1024 });
    return path;
  })().catch(error => { compilation = undefined; throw new Error(`无法启动本机扫描识别，请确认已安装 macOS 命令行工具。${error.message.includes('timeout') ? '编译超时。' : ''}`); });
  return compilation;
}

export async function recognizeScannedPages(buffer, pages, cacheDirectory, signal) {
  const binary = await binaryPath(cacheDirectory);
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'resume-ocr-'));
  try {
    const path = join(directory, 'input.pdf');
    await writeFile(path, buffer, { mode: 0o600 });
    const { stdout } = await run(binary, [path, pages.join(',')], { timeout: 90000, maxBuffer: 8 * 1024 * 1024, signal });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(error.killed ? '扫描识别超时，请减少页数或使用更清晰的文件。' : '无法识别扫描页面，请检查图片是否清晰、是否有密码保护。');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
