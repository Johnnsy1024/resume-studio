// 两端都未填写时不显示日期；只填开始时间时，默认持续至今。
export function dateRange(start: string, end: string, language = 'zh') {
  const first = start.trim(), last = end.trim();
  if (!first && !last) return '';
  return [first, last || (language === 'en' ? 'Present' : '至今')].filter(Boolean).join(' – ');
}
