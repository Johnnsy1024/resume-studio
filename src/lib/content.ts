import type { Resume } from '../schema.ts';
import { recognizeResume } from './importResume.ts';

export function descriptionLines(text: string) {
  return text.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*]\s+|[•·]\s*|\d+[.)]\s+|\d+、\s*)/, '').trim()).filter(Boolean);
}

export function toMarkdown(resume: Resume) {
  const { profile } = resume;
  const lines = [`# ${profile.name}`, profile.headline,
    [profile.city, profile.phone, profile.email, profile.website, profile.years].filter(Boolean).join(' | '), ''];
  if (profile.summary.trim()) lines.push(`## ${resume.language === 'en' ? 'Profile' : '个人简介'}`, profile.summary, '');
  for (const section of resume.sections.filter(section => section.visible)) {
    lines.push(`## ${section.title}`);
    for (const item of section.items) {
      if (item.title || item.subtitle) lines.push(`### ${[item.title, item.subtitle].filter(Boolean).join(' · ')}`);
      const meta = [[item.start, item.end].filter(Boolean).join(' – '), item.location].filter(Boolean).join(' | ');
      if (meta) lines.push(meta);
      lines.push(...descriptionLines(item.description).map(line => `- ${line}`), '');
    }
  }
  return lines.join('\n');
}

export function importText(source: string): Resume {
  return recognizeResume(source).resume;
}

export type ResumeCheck = { level: 'warning' | 'tip' | 'pass'; title: string; detail: string };
export function checkResume(resume: Resume, pageCount: number): ResumeCheck[] {
  const checks: ResumeCheck[] = [];
  const { profile } = resume;
  checks.push(profile.name.trim() && profile.headline.trim()
    ? { level: 'pass', title: '姓名和求职意向完整', detail: '招聘者可以快速识别你的基本信息。' }
    : { level: 'warning', title: '补充姓名或求职意向', detail: '在基本信息中填写姓名和希望应聘的岗位。' });
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email);
  checks.push(emailValid || profile.phone.trim()
    ? { level: 'pass', title: '已提供联系方式', detail: emailValid ? '邮箱格式正确，请再确认地址可以收件。' : '已填写电话，建议同时提供有效邮箱。' }
    : { level: 'warning', title: '添加有效联系方式', detail: '请填写电话或格式正确的邮箱。' });
  if (profile.email && !emailValid) checks.push({ level: 'warning', title: '邮箱格式可能有误', detail: '检查是否缺少 @、域名，或包含空格。' });
  const visible = resume.sections.filter(section => section.visible);
  const experience = visible.filter(section => ['experience', 'projects'].includes(section.kind)).flatMap(section => section.items).filter(item => item.title.trim());
  checks.push(experience.length
    ? { level: 'pass', title: '已填写经历', detail: `包含 ${experience.length} 条工作或项目经历。` }
    : { level: 'tip', title: '添加工作、实习或项目经历', detail: '可以从一个具体问题、你的行动和结果开始写。' });
  const described = experience.filter(item => item.description.trim());
  if (experience.some(item => !item.description.trim())) checks.push({ level: 'tip', title: '有经历缺少具体说明', detail: '补充你负责的事情、采取的行动和实际结果。' });
  if (described.length && !described.some(item => /\d/.test(item.description))) checks.push({ level: 'tip', title: '可以补充结果数据', detail: '在有真实依据时，写出规模、效率、完成数量或变化幅度。' });
  const longLines = described.flatMap(item => descriptionLines(item.description)).filter(line => line.length > 150);
  if (longLines.length) checks.push({ level: 'tip', title: `${longLines.length} 条描述比较长`, detail: '尝试一行写一个要点，把任务、行动和结果讲清楚。' });
  checks.push(pageCount <= 2
    ? { level: 'pass', title: `当前排版共 ${pageCount} 页`, detail: '投递前请检查分页位置、日期和文字内容。' }
    : { level: 'tip', title: `当前共 ${pageCount} 页，建议精简`, detail: '优先保留与目标岗位有关的经历，也可以使用一键适配调整间距。' });
  const dateNumber = (value: string) => {
    const match = value.match(/^(\d{4})[.\-/](\d{1,2})$/);
    return match ? Number(match[1]) * 12 + Number(match[2]) : null;
  };
  if (visible.flatMap(section => section.items).some(item => {
    const start = dateNumber(item.start), end = dateNumber(item.end);
    return start !== null && end !== null && start > end;
  })) checks.push({ level: 'warning', title: '有经历的起止日期颠倒', detail: '请检查工作、项目或教育经历中的开始和结束时间。' });
  return checks;
}

export function cleanResume(resume: Resume): Resume {
  const clean = (text: string) => text.split('\n').map(line => line.trim().replace(/[ \t]+/g, ' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { ...resume,
    profile: Object.fromEntries(Object.entries(resume.profile).map(([key, value]) => [key, clean(value)])) as Resume['profile'],
    sections: resume.sections.map(section => ({ ...section, title: clean(section.title), items: section.items.map(item => ({ ...item,
      title: clean(item.title), subtitle: clean(item.subtitle), location: clean(item.location), start: clean(item.start), end: clean(item.end),
      description: descriptionLines(item.description).join('\n'),
    })) })),
  };
}

export function download(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
