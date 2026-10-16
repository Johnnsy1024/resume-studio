function rowText(items) {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  let text = '';
  let end = -Infinity;
  for (const item of sorted) {
    const gap = item.x - end;
    const characterWidth = item.width / Math.max(1, item.text.length);
    const separator = text && gap > Math.max(item.height * 1.4, 14) ? '\t' : text && gap > Math.max(1.5, characterWidth * 0.3) ? ' ' : '';
    text += `${separator}${item.text}`;
    end = Math.max(end, item.x + item.width);
  }
  return text.trim();
}

function toRows(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rows[rows.length - 1];
    const tolerance = Math.max(2, Math.min(item.height, last?.height || item.height) * 0.4);
    if (last && Math.abs(item.y - last.y) <= tolerance) last.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }
  return rows;
}

function rowSegments(row) {
  const segments = [];
  for (const item of [...row.items].sort((left, right) => left.x - right.x)) {
    const last = segments[segments.length - 1];
    if (last && item.x - last.end <= Math.max(14, Math.min(last.height, item.height) * 0.9)) {
      last.items.push(item); last.end = Math.max(last.end, item.x + item.width); last.height = Math.max(last.height, item.height);
    } else segments.push({ items: [item], x: item.x, end: item.x + item.width, height: item.height });
  }
  return segments.map(segment => ({ text: rowText(segment.items), x: segment.x, y: row.y, width: segment.end - segment.x, height: segment.height }));
}

// 两栏分别自上而下阅读，避免把左侧技能与右侧工作经历接成同一行。
export function orderedPageText(items, pageWidth) {
  const raw = items.filter(item => item.text.trim() && Number.isFinite(item.x) && Number.isFinite(item.y));
  // 先接回同一行的连续字形，再找栏间空白，避免分字体的汉字被误判成两栏。
  const rows = toRows(raw).map(row => ({ ...row, items: rowSegments(row) }));
  const nonempty = rows.flatMap(row => row.items);
  if (rows.length < 8) return rows.map(row => rowText(row.items)).join('\n');
  let split = null;
  let bestScore = -Infinity;
  for (let fraction = 0.23; fraction <= 0.68; fraction += 0.025) {
    const x = pageWidth * fraction;
    const left = nonempty.filter(item => item.x + item.width < x - 5);
    const right = nonempty.filter(item => item.x > x + 5);
    const crossing = nonempty.filter(item => item.x < x + 5 && item.x + item.width > x - 5);
    const rightWords = right.filter(item => /[\p{L}]/u.test(item.text) && !/^(?:\d{4}[.\-/]|至今|present)/i.test(item.text));
    const bothSides = rows.filter(row => row.items.some(item => item.x + item.width < x - 5) && row.items.some(item => item.x > x + 5)).length;
    if (left.length < 6 || rightWords.length < 8 || bothSides < 4 || crossing.length > nonempty.length * 0.14) continue;
    const score = bothSides - crossing.length * 2;
    if (score > bestScore) { bestScore = score; split = x; }
  }
  if (split === null) return rows.map(row => rowText(row.items)).join('\n');
  const crossingRows = rows.filter(row => row.items.some(item => item.x < split && item.x + item.width > split));
  const firstColumnY = Math.min(...nonempty.filter(item => item.x > split && item.text.trim().length > 3).map(item => item.y));
  const header = crossingRows.filter(row => row.y < firstColumnY + 2);
  const headerItems = new Set(header.flatMap(row => row.items));
  const body = nonempty.filter(item => !headerItems.has(item));
  const left = body.filter(item => item.x < split);
  const right = body.filter(item => item.x >= split);
  return [...header.map(row => rowText(row.items)), ...toRows(left).map(row => rowText(row.items)), ...toRows(right).map(row => rowText(row.items))].join('\n');
}
