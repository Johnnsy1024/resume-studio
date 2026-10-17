import type { TextFormat } from '../schema.ts';

export type FormatMark = 'bold' | 'black' | 'underline';
const plain = { bold: false, black: false, underline: false };
const same = (a: TextFormat, b: TextFormat) => a.bold === b.bold && a.black === b.black && a.underline === b.underline;

function merge(formats: TextFormat[]) {
  const result: TextFormat[] = [];
  for (const span of formats) {
    if (span.end <= span.start || !(span.bold || span.black || span.underline)) continue;
    const previous = result.at(-1);
    if (previous && previous.end === span.start && same(previous, span)) previous.end = span.end;
    else result.push({ ...span });
  }
  return result;
}

export function sliceFormats(formats: TextFormat[] = [], start: number, end: number): TextFormat[] {
  return formats.filter(span => span.end > start && span.start < end).map(span => ({ ...span,
    start: Math.max(start, span.start) - start, end: Math.min(end, span.end) - start,
  }));
}

export function hasFormat(formats: TextFormat[], start: number, end: number, mark: FormatMark) {
  if (end <= start) return false;
  let cursor = start;
  for (const span of formats) {
    if (span.end <= cursor) continue;
    if (span.start > cursor || !span[mark]) return false;
    cursor = Math.min(end, span.end);
    if (cursor === end) return true;
  }
  return false;
}

// 按选区边界拆分格式，保留未选中文字的原有样式。
export function toggleFormat(formats: TextFormat[], start: number, end: number, mark: FormatMark | null) {
  if (end <= start) return formats;
  const enabled = mark ? !hasFormat(formats, start, end, mark) : false;
  const boundaries = [...new Set([start, end, ...formats.flatMap(span => [span.start, span.end])])].sort((a, b) => a - b);
  const result: TextFormat[] = [];
  let index = 0;
  for (let part = 0; part < boundaries.length - 1; part++) {
    const left = boundaries[part], right = boundaries[part + 1];
    while (index < formats.length && formats[index].end <= left) index++;
    const original = formats[index];
    const span: TextFormat = { ...(original && original.start <= left ? original : plain), start: left, end: right };
    if (left >= start && right <= end) {
      if (mark) span[mark] = enabled;
      else Object.assign(span, plain);
    }
    result.push(span);
  }
  return merge(result);
}

// 输入、删除或粘贴后移动选区位置；新文字继承插入点原有的格式。
export function editFormats(before: string, after: string, formats: TextFormat[] = [], edit?: { start: number; end: number; inputType: string }) {
  if (before === after) return formats;
  let start = edit?.start ?? 0, oldEnd = edit?.end ?? before.length;
  const delta = after.length - before.length;
  if (edit && start === oldEnd && delta < 0) {
    if (edit.inputType.endsWith('Backward')) start += delta;
    else if (edit.inputType.endsWith('Forward')) oldEnd -= delta;
  }
  let newEnd = oldEnd + delta;
  // 优先使用真实输入位置，重复文字不能只靠前后缀推断；撤销和输入法改写按实际文本比较。
  if (!edit || start < 0 || newEnd < start || before.slice(0, start) !== after.slice(0, start) || before.slice(oldEnd) !== after.slice(newEnd)) {
    start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    oldEnd = before.length; newEnd = after.length;
    while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  }
  const inherited = formats.find(span => span.start <= start && span.end > start);
  return merge([
    ...sliceFormats(formats, 0, start),
    ...(inherited && newEnd > start ? [{ ...inherited, start, end: newEnd }] : []),
    ...sliceFormats(formats, oldEnd, before.length).map(span => ({ ...span, start: span.start + newEnd, end: span.end + newEnd })),
  ]);
}

export function formattedRuns(text: string, formats: TextFormat[] = []) {
  const runs: (TextFormat & { text: string })[] = [];
  let cursor = 0;
  for (const span of formats) {
    if (span.start > cursor) runs.push({ ...plain, start: cursor, end: span.start, text: text.slice(cursor, span.start) });
    runs.push({ ...span, text: text.slice(span.start, span.end) });
    cursor = span.end;
  }
  if (cursor < text.length) runs.push({ ...plain, start: cursor, end: text.length, text: text.slice(cursor) });
  return runs;
}

export function formatClass(span: Pick<TextFormat, FormatMark>) {
  return [span.bold && 'text-bold', span.black && 'text-black', span.underline && 'text-underline'].filter(Boolean).join(' ');
}

// 保留每个要点在原文中的位置，去掉列表符号时仍能准确对应文字格式。
export function descriptionSegments(source: string, bullets = true, lineBullets?: boolean[]) {
  const lines: { text: string; start: number; end: number; bullet: boolean }[] = [];
  let offset = 0;
  for (const [index, line] of source.split('\n').entries()) {
    const bullet = lineBullets?.[index] ?? bullets;
    const body = bullet ? line.replace(/^\s*(?:[-*]\s+|[•·]\s*|\d+[.)]\s+|\d+、\s*)/, '') : line;
    const text = body.trim();
    const start = offset + line.length - body.length + body.length - body.trimStart().length;
    if (text) lines.push({ text, start, end: start + text.length, bullet });
    offset += line.length + 1;
  }
  return lines;
}

export function cleanDescription(source: string, formats: TextFormat[] = [], bullets = true, lineBullets?: boolean[]) {
  const lines = descriptionSegments(source, bullets, lineBullets);
  let offset = 0;
  const next = lines.flatMap(line => {
    const spans = sliceFormats(formats, line.start, line.end).map(span => ({ ...span, start: span.start + offset, end: span.end + offset }));
    offset += line.text.length + 1;
    return spans;
  });
  return { description: lines.map(line => line.text).join('\n'), descriptionFormat: merge(next), ...(lineBullets ? { descriptionLineBullets: lines.map(line => line.bullet) } : {}) };
}

export function formattedMarkdown(text: string, formats: TextFormat[] = []) {
  return formattedRuns(text, formats).map(run => {
    if (!(run.bold || run.black || run.underline)) return run.text;
    const [, left, core, right] = run.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!core) return run.text;
    let value = core.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*/g, '\\*');
    if (run.bold) value = `**${value}**`;
    if (run.underline) value = `<u>${value}</u>`;
    if (run.black) value = `<span style="color:#000">${value}</span>`;
    return left + value + right;
  }).join('');
}


// 复用文本编辑位置映射，让插入、删除和拆分段落后，后续段落的类型随文字移动。
export function editLineBullets(before: string, after: string, modes: boolean[] | undefined, defaultBullet: boolean, edit?: { start: number; end: number; inputType: string }) {
  if (before === after) return modes;
  let offset = 0;
  const spans = before.split('\n').map((line, index) => {
    const start = offset;
    offset += line.length + 1;
    return { start, end: Math.min(offset, before.length), bold: true, black: modes?.[index] ?? defaultBullet, underline: false };
  }).filter(span => span.end > span.start);
  const moved = editFormats(before, after, spans, edit);
  offset = 0;
  return after.split('\n').map(line => {
    const position = offset;
    offset += line.length + 1;
    return moved.find(span => span.start <= position && span.end > position)?.black ?? defaultBullet;
  });
}
