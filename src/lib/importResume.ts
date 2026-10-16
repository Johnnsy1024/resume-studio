import { createBlank, newItem, newSection, resumeSchema } from '../schema.ts';
import type { Resume, ResumeItem, Section, SectionKind } from '../schema.ts';

export const MAX_IMPORT_CHARACTERS = 60000;
type HeadingKind = SectionKind | 'summary';
const headingGroups: [HeadingKind, string[]][] = [
  ['summary', ['个人简介', '自我评价', '个人优势', '自我介绍', '职业概述', '个人总结', 'summary', 'profile', 'about me', 'professional summary']],
  ['experience', ['工作经历', '工作经验', '职业经历', '工作履历', '实习经历', '实习经验', 'work experience', 'professional experience', 'employment history', 'employment', 'experience', 'career history']],
  ['projects', ['项目经历', '项目经验', '项目实践', '实践经历', 'projects', 'project experience', 'selected projects']],
  ['education', ['教育经历', '教育背景', '学习经历', 'education', 'educational background', 'academic background']],
  ['skills', ['专业技能', '个人技能', '技能特长', '职业技能', '技术技能', '技术栈', '技能', 'skills', 'technical skills', 'core skills', 'core competencies']],
  ['custom', ['证书', '资格证书', '专业证书', '证书与奖项', '证书与荣誉', '获奖经历', '荣誉奖项', '荣誉奖励', '奖项', '语言能力', '语言', '志愿经历', '志愿服务', '兴趣爱好', '其他信息', 'certifications', 'certificates', 'awards', 'honors', 'languages', 'volunteering', 'interests', 'additional information']],
];
const headingKey = (value: string) => value.toLowerCase().replace(/[\s\u3000]+/g, '');
const headings = new Map(headingGroups.flatMap(([kind, names]) => names.map(name => [headingKey(name), kind] as const)));
const cities = /^(北京|上海|广州|深圳|杭州|南京|苏州|成都|武汉|西安|重庆|天津|长沙|郑州|合肥|厦门|青岛|济南|宁波|香港|澳门|台北|远程)(?:市)?$/;
const rolePattern = /经理|工程师|设计师|分析师|研究员|总监|负责人|专员|开发|运营|产品|算法|实习生|顾问|架构师|engineer|developer|manager|designer|analyst|scientist|director|consultant|architect|intern|specialist|\blead\b|\bofficer\b/i;
const descriptionStart = /^(?:[-*•●▪‣]\s*|\d+[.)、]\s+|负责|主导|参与|完成|推动|实现|提升|降低|优化|搭建|开发了|建立|带领|协助|设计了|通过|基于|利用|led\b|built\b|developed\b|managed\b|improved\b|implemented\b|responsible\b|achieved\b|designed\b|delivered\b)/i;
const datePart = '(?:(?:19|20)\\d{2}(?:\\s*年\\s*\\d{1,2}\\s*月?|[./-]\\d{1,2}(?:[./-]\\d{1,2})?)?\\s*年?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+(?:19|20)\\d{2})';
const dateRange = new RegExp(`(${datePart})\\s*(?:[–—−~～至到]|\\s+-\\s+|-(?=(?:19|20)\\d{2}|present|current|now|至今))\\s*(${datePart}|至今|现在|Present|Current|Now)`, 'i');

function cleanLine(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '').replace(/[ \t]+$/g, '').trim();
}
function headingText(value: string) {
  return cleanLine(value).replace(/^#{1,6}\s*/, '').replace(/^[■□◆◇●▪▶★]+\s*/, '')
    .replace(/^(?:\d{1,2}[.、)）]?\s+|[一二三四五六七八九十]+[、.．]\s*)/, '').replace(/[：:]$/, '').trim();
}
export function identifyHeading(value: string): HeadingKind | undefined {
  return headings.get(headingKey(headingText(value)));
}
function cleanDate(value: string) {
  return value.trim().replace(/(\d{4})\s*年\s*(\d{1,2})\s*月?/, (_, year: string, month: string) => `${year}.${month.padStart(2, '0')}`);
}
export function extractDateRange(value: string) {
  const match = value.match(dateRange);
  if (!match) return null;
  return { start: cleanDate(match[1]), end: cleanDate(match[2]), remaining: value.replace(match[0], '').replace(/^[\s|｜·]+|[\s|｜·]+$/g, '').trim() };
}

function splitTitle(value: string, kind: SectionKind) {
  let parts = value.split(/\t+|\s{2,}|\s*[|｜]\s*/).map(part => part.trim()).filter(Boolean);
  if (parts.length === 1 && /[·•]/.test(value)) {
    const candidate = value.split(/\s*[·•]\s*/);
    if (kind !== 'projects' || rolePattern.test(candidate.slice(1).join(' '))) parts = candidate;
  }
  if (parts.length === 1 && kind !== 'projects') {
    const match = value.match(/^(.+?)\s+([^\t|｜]{2,70})$/);
    if (match && (rolePattern.test(match[2]) || /本科|硕士|博士|学士|Bachelor|Master|Ph\.?D/i.test(match[2]))) parts = [match[1], match[2]];
  }
  return { title: parts[0] || '', subtitle: parts.slice(1).join(' · ') };
}

function appendDescription(item: ResumeItem, line: string) {
  // PDF 在逗号处折行时接回同一段，显式列表仍保留分行。
  if (/[,，、]$/.test(item.description) && !/^\s*(?:[-*•●▪]\s*|\d+[.)、]\s+)/.test(line)) {
    item.description += `${/[A-Za-z0-9][,，、]$/.test(item.description) && /^[A-Za-z0-9]/.test(line) ? ' ' : ''}${line}`;
    return;
  }
  item.description += `${item.description ? '\n' : ''}${line}`;
}
function organizationLine(value: string, kind: SectionKind) {
  if (value.length > 75 || descriptionStart.test(value) || /[。！？!?；;]/.test(value)) return false;
  if (kind === 'education') return /大学|学院|高中|University|College|Institute|School/i.test(value);
  return /公司|科技|集团|银行|研究院|工作室|互联网|\bInc\.?\b|\bLtd\.?\b|\bLLC\b|\bLabs?\b|\bCorporation\b/i.test(value);
}

function parseEntries(section: Section, lines: string[]) {
  let current: ResumeItem | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (section.kind === 'skills') {
      const plain = line.replace(/^(?:[•·●▪]\s*|[-*]\s+)/, '');
      const match = plain.match(/^([^:：\n]{1,36})[：:]\s*(.+)$/);
      const item = newItem();
      if (match) { item.title = match[1]; item.description = match[2]; }
      else item.description = plain;
      section.items.push(item);
      continue;
    }
    const explicit = /^#{2,6}\s/.test(line);
    const plain = line.replace(/^#{1,6}\s*/, '');
    const dates = extractDateRange(plain);
    const content = dates ? dates.remaining : plain;
    const nextDates = extractDateRange(lines[index + 1] || '');
    const titleFollowedByDate = line.length < 100 && !descriptionStart.test(line) && Boolean(nextDates && !nextDates.remaining);
    const newEntry = !current || explicit || (
      section.kind !== 'custom' && !descriptionStart.test(line) && (
        (Boolean(dates && content) && Boolean(current.description || current.start || current.end)) ||
        (organizationLine(content, section.kind) && Boolean(current.description || current.subtitle || current.start)) ||
        (titleFollowedByDate && Boolean(current.description || current.subtitle || current.start))
      )
    );
    if (newEntry) {
      current = newItem();
      section.items.push(current);
      if (descriptionStart.test(line)) { appendDescription(current, line); continue; }
      const parts = splitTitle(content, section.kind);
      current.title = parts.title;
      current.subtitle = parts.subtitle;
      if (dates) { current.start = dates.start; current.end = dates.end; }
      continue;
    }
    if (dates && !current!.start && !descriptionStart.test(line)) {
      current!.start = dates.start; current!.end = dates.end;
      if (content) {
        if (!current!.title) Object.assign(current!, splitTitle(content, section.kind));
        else if (!current!.subtitle && content.length <= 160) current!.subtitle = content;
        else appendDescription(current!, content);
      }
    } else if (!current!.title && content && !descriptionStart.test(content) && content.length < 150) {
      Object.assign(current!, splitTitle(content, section.kind));
    } else if (!current!.subtitle && !current!.description && line.length < 120 && !descriptionStart.test(line) &&
      (rolePattern.test(line) || /本科|硕士|博士|学士|专业|Bachelor|Master|Ph\.?D|B\.?Sc|M\.?Sc/i.test(line))) {
      current!.subtitle = line;
    } else appendDescription(current!, line);
  }
}

const profileLabels: [keyof Resume['profile'], string][] = [
  ['name', '姓名|Name'], ['headline', '求职意向|目标岗位|应聘职位|意向岗位|意向职位|Desired Role|Target Role'],
  ['email', '邮箱|电子邮箱|电子邮件|E-?mail'], ['phone', '手机号码|联系电话|联系方式|手机|电话|Phone|Mobile|Tel'],
  ['city', '现居城市|所在城市|现居地|现居|城市|地址|Location|Based in'], ['years', '工作年限|工作经验|从业年限'],
  ['website', '个人网站|作品集|网站|Website|Portfolio|LinkedIn|GitHub'],
];
const allLabels = profileLabels.map(([, expression]) => expression).join('|');
function cleanYears(value: string) {
  return value.trim().replace(/(?:工作|从业)?(?:经验|经历)$/, '').replace(/\s+(?:of\s+)?experience$/i, '').trim();
}
function parseHeader(lines: string[], resume: Resume) {
  const remainder: string[] = [];
  for (const source of lines) {
    let line = source.replace(/^#{1,6}\s*/, '');
    if (/^(?:个人简历|求职简历|简历|résumé|resume|curriculum vitae|cv)(?:[（(].*[）)])?$/i.test(line.replace(/\s/g, ''))) continue;
    for (const [key, expression] of profileLabels) {
      const pattern = new RegExp(`(?:^|[\\s|｜])(?:${expression})\\s*[：:]\\s*(.+?)(?=\\s+(?:${allLabels})\\s*[：:]|[|｜]|$)`, 'i');
      const match = line.match(pattern);
      if (match && match[1].trim().length <= (key === 'name' ? 100 : key === 'website' ? 240 : key === 'headline' || key === 'email' ? 160 : key === 'city' ? 120 : 80)) {
        if (!resume.profile[key]) resume.profile[key] = key === 'years' ? cleanYears(match[1]) : match[1].trim();
        line = line.replace(match[0], ' ');
      }
    }
    const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (email) { if (!resume.profile.email) resume.profile.email = email; line = line.replace(email, ' '); }
    const phone = line.match(/(?:\+?86[-\s]?)?1[3-9](?:[-\s]?\d){9}\b/)?.[0]
      || line.match(/\+\d[\d ()-]{7,22}\d/)?.[0];
    if (phone) { if (!resume.profile.phone) resume.profile.phone = phone; line = line.replace(phone, ' '); }
    const website = line.match(/(?:https?:\/\/|www\.)[^\s|｜]+|(?:github\.com|linkedin\.com)\/[^\s|｜]+/i)?.[0];
    if (website && website.length <= 240) { if (!resume.profile.website) resume.profile.website = website; line = line.replace(website, ' '); }
    const years = line.match(/\b\d{1,2}\s*年(?:工作|从业)?(?:经验|经历)|\b\d{1,2}\+?\s*years?(?:\s+(?:of\s+)?experience)?/i)?.[0];
    if (years) { if (!resume.profile.years) resume.profile.years = cleanYears(years); line = line.replace(years, ' '); }
    const parts = line.split(/[|｜\t]/).map(part => part.trim().replace(/^[·,，;；\s]+|[·,，;；\s]+$/g, '')).filter(Boolean);
    for (const part of parts) {
      if (cities.test(part) && !resume.profile.city) { resume.profile.city = part; continue; }
      const compact = part.replace(/\s+/g, '');
      if (!resume.profile.name && !rolePattern.test(compact) && !cities.test(compact) &&
        (/^[\p{Script=Han}·]{2,8}(?:\([^()]{1,40}\))?$/u.test(compact) || /^[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){1,4}$/.test(part))) {
        resume.profile.name = /^[\p{Script=Han}·]/u.test(compact) ? compact : part; continue;
      }
      if (!resume.profile.headline && part.length <= 100 && rolePattern.test(part) && !descriptionStart.test(part)) { resume.profile.headline = part; continue; }
      remainder.push(part);
    }
  }
  return remainder;
}

function boundFields(resume: Resume) {
  for (const section of resume.sections) {
    const items: ResumeItem[] = [];
    for (const item of section.items) {
      if (item.title.length > 240) { item.description = `${item.title}\n${item.description}`.trim(); item.title = item.title.slice(0, 237) + '…'; }
      if (item.subtitle.length > 240) { item.description = `${item.subtitle}\n${item.description}`.trim(); item.subtitle = ''; }
      const chunks = item.description.match(/[\s\S]{1,30000}/gu) || [''];
      items.push({ ...item, description: chunks[0] });
      for (const chunk of chunks.slice(1)) items.push({ ...newItem(), description: chunk });
    }
    section.items = items;
  }
}

// 按原文中的标签、标题和日期识别字段；无法分类的内容仍保留为可编辑模块。
export function recognizeResume(source: string, filename = ''): { resume: Resume; warnings: string[] } {
  if (source.length > MAX_IMPORT_CHARACTERS) throw new Error('识别文字超过 6 万字，请只导入简历相关页面。');
  const resume = createBlank();
  resume.sections = [];
  const warnings: string[] = [];
  const lines = source.normalize('NFKC').replace(/\r/g, '\n').split('\n').map(cleanLine).filter(Boolean);
  const header: string[] = [];
  const summary: string[] = [];
  let current: { kind: HeadingKind; title: string; lines: string[] } | undefined;
  const groups: NonNullable<typeof current>[] = [];
  for (let line of lines) {
    const inline = line.match(/^(.{2,35}?)[：:]\s*(.+)$/);
    const inlineYears = inline && /^(?:工作经验|工作年限)$/.test(inline[1]) && /^\d{1,2}\s*年/.test(inline[2]);
    const skillLabel = inline && current?.kind === 'skills';
    const kind = inlineYears || skillLabel ? undefined : identifyHeading(inline?.[1] || line);
    const markdownCustom = /^#{1,2}\s/.test(line) && !kind && groups.length > 0;
    if (kind || markdownCustom) {
      current = { kind: kind || 'custom', title: headingText(inline?.[1] || line), lines: [] };
      groups.push(current);
      if (!inline) continue;
      line = inline[2];
    }
    if (current) current.lines.push(line);
    else header.push(line);
  }
  const unclassified = parseHeader(header, resume);
  for (const group of groups) {
    if (group.kind === 'summary') { summary.push(...group.lines); continue; }
    const section = newSection(group.kind, group.title);
    section.items = [];
    parseEntries(section, group.lines);
    if (section.items.length) resume.sections.push(section);
  }
  if (summary.join('\n').length > 20000) {
    const section = newSection('custom', resume.language === 'en' ? 'Profile' : '个人简介');
    section.items[0].description = summary.join('\n');
    resume.sections.unshift(section);
  } else resume.profile.summary = summary.join('\n');
  if (unclassified.length) {
    const section = newSection('custom', groups.length ? '其他个人信息' : '导入内容');
    section.items[0].description = unclassified.join('\n');
    resume.sections.push(section);
  }
  if (!resume.sections.length && !resume.profile.summary && !resume.profile.name && !resume.profile.email && !resume.profile.phone) {
    throw new Error('没有识别到可导入的简历文字，请检查文件是否包含清晰可读的内容。');
  }
  if (!resume.profile.name) warnings.push('未识别到姓名，可在基本信息中补充。');
  if (!groups.length) warnings.push('未发现常见模块标题，其余文字已保留在“导入内容”中。');
  const englishHeadings = groups.filter(group => /^[A-Za-z\s]+$/.test(group.title)).length;
  if (englishHeadings > groups.length / 2) resume.language = 'en';
  resume.title = `${resume.profile.name || filename.replace(/\.[^.]+$/, '') || '导入的简历'} · 简历`.slice(0, 120);
  boundFields(resume);
  const parsed = resumeSchema.safeParse(resume);
  if (!parsed.success) throw new Error('识别内容超过编辑器的长度或条目限制，请拆分文件后再导入。');
  return { resume: parsed.data, warnings };
}
