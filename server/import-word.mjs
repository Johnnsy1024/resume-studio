import { unzipSync, strFromU8 } from 'fflate';
import { parseDocument } from 'htmlparser2';
import WordExtractor from 'word-extractor';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { identifyHeading } from '../src/lib/importResume.ts';

const children = node => node.children || [];
const tags = (node, name) => children(node).filter(child => child.name === name);
const descendants = (node, name) => children(node).flatMap(child => child.name === name ? [child] : descendants(child, name));
const named = (node, name) => descendants(node, name)[0];

function inlineText(node) {
  if (['w:del', 'w:instrText', 'w:txbxContent'].includes(node.name)) return '';
  if (node.name === 'w:t') return children(node).map(child => child.data || '').join('');
  if (node.name === 'w:tab') return '\t';
  if (node.name === 'w:br' || node.name === 'w:cr') return '\n';
  return children(node).map(inlineText).join('');
}

function wordLines(node) {
  if (node.name === 'w:p') {
    const text = inlineText(node).trim();
    const style = named(node, 'w:pStyle')?.attribs?.['w:val'] || '';
    const isHeading = /heading|标题|^title$/i.test(style);
    const isList = named(node, 'w:numPr') || /^List(Bullet|Number)/i.test(style);
    const prefix = isHeading ? (identifyHeading(text) ? '## ' : '### ') : isList && !identifyHeading(text) ? '- ' : '';
    const lines = text ? [`${prefix}${text}`] : [];
    return [...lines, ...descendants(node, 'w:txbxContent').flatMap(box => children(box).flatMap(wordLines))];
  }
  if (node.name === 'w:tbl') {
    return tags(node, 'w:tr').flatMap(row => {
      const cells = tags(row, 'w:tc').map(cell => children(cell).flatMap(wordLines).filter(Boolean));
      // 表格模拟的左右栏按列读取；公司、职位、日期这类短单元格按行合并。
      const columns = cells.length === 2 && cells.every(lines => lines.length > 3 && lines.some(line => identifyHeading(line)));
      if (columns) return cells.flatMap(lines => lines);
      if (cells.length === 1) return cells[0];
      return [cells.map(lines => lines.join(' ')).join('\t')].filter(line => line.trim());
    });
  }
  return children(node).flatMap(wordLines);
}

function openDocx(buffer) {
  let total = 0, count = 0;
  try {
    const files = unzipSync(new Uint8Array(buffer), { filter: entry => {
      total += entry.originalSize;
      count++;
      if (total > 50 * 1024 * 1024 || count > 1500) throw new Error('DOCUMENT_SIZE_LIMIT');
      return /^word\/(document\.xml|header\d+\.xml|media\/[^/]+\.(png|jpe?g|webp))$/i.test(entry.name);
    } });
    if (!files['word/document.xml']) throw new Error('MISSING_DOCUMENT');
    return files;
  } catch (error) {
    if (error.message === 'DOCUMENT_SIZE_LIMIT') throw new Error('Word 文件解压后过大，请压缩图片或减少内容后再导入。');
    throw new Error('无法读取 Word 文件，请确认文件完整、未加密，且确实为 .docx 格式。');
  }
}

async function photoCandidate(buffer) {
  try {
    const image = await loadImage(buffer);
    const ratio = image.width / image.height;
    if (image.width < 80 || image.height < 80 || ratio < 0.6 || ratio > 1.25 || image.width * image.height > 16000000) return null;
    const scale = Math.min(1, 480 / Math.max(image.width, image.height));
    const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch { return null; }
}

export async function extractWord(buffer, extension) {
  if (extension === '.doc') {
    try {
      const document = await new WordExtractor().extract(buffer);
      const body = document.getBody();
      const textboxes = document.getTextboxes({ includeHeadersAndFooters: false });
      const headers = document.getHeaders({ includeFooters: false });
      return { text: [headers, body, textboxes].filter(Boolean).join('\n'), photos: [], pageCount: null, ocrPages: [] };
    } catch { throw new Error('无法读取旧版 Word 文件，请确认文件完整且没有密码保护。也可在 Word 中另存为 .docx 后导入。'); }
  }
  const files = openDocx(buffer);
  const xmlOptions = { xmlMode: true, decodeEntities: true };
  const headerText = Object.keys(files).filter(name => /^word\/header\d+\.xml$/.test(name))
    .map(name => wordLines(parseDocument(strFromU8(files[name]), xmlOptions)).join('\n'));
  const documentText = wordLines(parseDocument(strFromU8(files['word/document.xml']), xmlOptions)).join('\n');
  const photos = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.startsWith('word/media/') || bytes.length > 4 * 1024 * 1024 || photos.length >= 4) continue;
    const photo = await photoCandidate(Buffer.from(bytes));
    if (photo) photos.push(photo);
  }
  return { text: [...headerText, documentText].filter(Boolean).join('\n'), photos, pageCount: null, ocrPages: [] };
}
