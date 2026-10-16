import { extname } from 'node:path';
import { recognizeResume, MAX_IMPORT_CHARACTERS } from '../src/lib/importResume.ts';
import { extractWord } from './import-word.mjs';
import { extractPdf } from './import-pdf.mjs';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export async function importResumeFile(buffer, filename, { cacheDirectory, signal } = {}) {
  if (!buffer.length) throw new Error('文件是空的，请重新选择。');
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error('文件超过 20 MB，请压缩图片或减少页数后再导入。');
  const extension = extname(filename).toLowerCase();
  if (!['.doc', '.docx', '.pdf'].includes(extension)) throw new Error('请选择 Word（.docx、.doc）或 PDF 文件。');
  signal?.throwIfAborted();
  const extracted = extension === '.pdf' ? await extractPdf(buffer, cacheDirectory, signal) : await extractWord(buffer, extension);
  const text = extracted.text.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, '').trim();
  if (text.length > MAX_IMPORT_CHARACTERS) throw new Error('识别文字超过 6 万字，请只导入简历相关页面。');
  if (!text) throw new Error('没有识别到文字，请确认页面清晰、不是空白文件。');
  const recognized = recognizeResume(text, filename);
  if (extracted.ocrPages.length) recognized.warnings.unshift('扫描页已通过本机文字识别转成可编辑内容，请留意姓名、数字和日期。');
  return { ...recognized, text, photos: extracted.photos, pageCount: extracted.pageCount, ocrPages: extracted.ocrPages, filename };
}
