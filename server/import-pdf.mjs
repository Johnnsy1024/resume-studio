import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { orderedPageText } from './import-layout.mjs';
import { recognizeScannedPages } from './ocr.mjs';

const require = createRequire(import.meta.url);
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
function multiply(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}

function paintedImages(operations) {
  const images = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let index = 0; index < operations.fnArray.length; index++) {
    const fn = operations.fnArray[index], args = operations.argsArray[index];
    if (fn === OPS.save) stack.push([...matrix]);
    else if (fn === OPS.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) matrix = multiply(matrix, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const area = Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
      images.push({ fn, args, area });
    }
  }
  return images;
}

async function pagePhotos(page, images, pageArea) {
  const photos = [];
  for (const { fn, args, area } of images) {
    if (photos.length >= 3) break;
    if (area < pageArea * 0.003 || area > pageArea * 0.22) continue;
    try {
      const image = fn === OPS.paintInlineImageXObject ? args[0] : await new Promise(resolve => {
        const objects = args[0].startsWith('g_') ? page.commonObjs : page.objs;
        objects.get(args[0], resolve);
      });
      if (!image?.data || image.width < 80 || image.height < 80 || image.width * image.height > 8000000 || image.width / image.height < 0.6 || image.width / image.height > 1.25 || ![2, 3].includes(image.kind)) continue;
      const raw = createCanvas(image.width, image.height);
      const context = raw.getContext('2d');
      const pixels = context.createImageData(image.width, image.height);
      if (image.kind === 3) pixels.data.set(image.data);
      else for (let pixel = 0; pixel < image.width * image.height; pixel++) {
        pixels.data[pixel * 4] = image.data[pixel * 3];
        pixels.data[pixel * 4 + 1] = image.data[pixel * 3 + 1];
        pixels.data[pixel * 4 + 2] = image.data[pixel * 3 + 2];
        pixels.data[pixel * 4 + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      const thumbnail = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
      thumbnail.getContext('2d').drawImage(raw, 0, 0, thumbnail.width, thumbnail.height);
      photos.push(thumbnail.toDataURL('image/jpeg', 0.88));
    } catch { /* 图片无法解码时保留正文，照片仍可在编辑器中补充。 */ }
  }
  return photos;
}

export async function extractPdf(buffer, cacheDirectory, signal) {
  const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true,
    cMapUrl: join(pdfRoot, 'cmaps/'), cMapPacked: true, standardFontDataUrl: join(pdfRoot, 'standard_fonts/'),
    wasmUrl: join(pdfRoot, 'wasm/'), verbosity: 0 });
  let document;
  try {
    document = await task.promise;
    if (document.numPages > 30) throw new Error('PDF 超过 30 页，请只保留简历相关页面再导入。');
    const pages = [], ocrPages = [], photos = [];
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted();
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter(item => 'str' in item && item.str.trim()).map(item => ({
        text: item.str, x: item.transform[4], y: viewport.height - item.transform[5], width: item.width, height: Math.max(1, item.height),
      }));
      const text = orderedPageText(items, viewport.width);
      const operations = await page.getOperatorList();
      const images = paintedImages(operations);
      const area = viewport.width * viewport.height;
      const largeRaster = images.some(image => image.area > area * 0.35) || images.reduce((sum, image) => sum + image.area, 0) > area * 0.6;
      const characters = text.replace(/\s/g, '').length;
      if ((characters < 70 && images.length) || (characters < 500 && largeRaster)) ocrPages.push(number);
      pages.push(text);
      if (number === 1) photos.push(...await pagePhotos(page, images, area));
    }
    if (ocrPages.length) {
      const recognized = await recognizeScannedPages(buffer, ocrPages, cacheDirectory, signal);
      for (const page of recognized) pages[page.page - 1] = orderedPageText(page.lines, page.width);
    }
    return { text: pages.join('\n\n'), pageCount: document.numPages, ocrPages, photos };
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('PDF 有密码保护，请先解除密码后再导入。');
    if (error.name === 'InvalidPDFException') throw new Error('PDF 文件无法解析，请检查文件是否完整。');
    throw error;
  } finally { await task.destroy(); }
}
