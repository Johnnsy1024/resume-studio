import { z } from 'zod';

const text = (length = 240) => z.string().max(length);
export const textFormatSchema = z.object({
  start: z.number().int().min(0).max(30000), end: z.number().int().min(1).max(30000),
  bold: z.boolean(), black: z.boolean(), underline: z.boolean(),
});
export type TextFormat = z.infer<typeof textFormatSchema>;
function validateFormats(value: string, formats: TextFormat[] | undefined, field: string, context: z.RefinementCtx) {
  let previousEnd = 0;
  for (const span of formats || []) {
    if (span.start < previousEnd || span.end <= span.start || span.end > value.length || !(span.bold || span.black || span.underline)) {
      context.addIssue({ code: 'custom', path: [field], message: '文字格式必须按顺序对应原文中的有效选区' });
      break;
    }
    previousEnd = span.end;
  }
}
const workProjectSchema = z.object({
  id: z.uuid(), name: text(), description: text(30000),
  descriptionBullets: z.boolean().optional(),
  descriptionLineBullets: z.array(z.boolean()).max(30001).optional(),
  descriptionFormat: z.array(textFormatSchema).max(30000).optional(),
}).superRefine((project, context) => validateFormats(project.description, project.descriptionFormat, 'descriptionFormat', context));
export type WorkProject = z.infer<typeof workProjectSchema>;
export const itemSchema = z.object({
  projects: z.array(workProjectSchema).max(50).optional(),
  responsibilities: text(20000).optional(),
  responsibilitiesFormat: z.array(textFormatSchema).max(20000).optional(),
  id: z.uuid(),
  title: text(),
  subtitle: text(),
  location: text(120),
  start: text(40),
  end: text(40),
  description: text(30000),
  descriptionBullets: z.boolean().optional(),
  descriptionLineBullets: z.array(z.boolean()).max(30001).optional(),
  descriptionFormat: z.array(textFormatSchema).max(30000).optional(),
}).superRefine((item, context) => {
  validateFormats(item.responsibilities || '', item.responsibilitiesFormat, 'responsibilitiesFormat', context);
  validateFormats(item.description, item.descriptionFormat, 'descriptionFormat', context);
});
export const sectionSchema = z.object({
  id: z.uuid(),
  title: text(80),
  kind: z.enum(['experience', 'projects', 'education', 'skills', 'custom']),
  visible: z.boolean(),
  items: z.array(itemSchema).max(100),
});
export const styleSchema = z.object({
  template: z.enum(['classic', 'minimal', 'editorial', 'technical']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(['sans', 'serif', 'mono']),
  fontSize: z.number().min(10).max(16),
  lineHeight: z.number().min(1.25).max(1.9),
  sectionGap: z.number().min(8).max(32),
  margin: z.number().min(12).max(28),
  photoSize: z.number().min(60).max(112),
  photoShape: z.enum(['square', 'rounded', 'circle']),
  headerAlign: z.enum(['left', 'center']),
  showFooter: z.boolean(),
});
export const resumeSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  title: text(120).min(1),
  updatedAt: z.iso.datetime(),
  language: z.enum(['zh', 'en']),
  profile: z.object({
    name: text(100),
    headline: text(160),
    email: text(160),
    phone: text(80),
    city: text(120),
    years: text(80),
    website: text(240),
    summary: text(20000),
    summaryFormat: z.array(textFormatSchema).max(20000).optional(),
  }).superRefine((profile, context) => validateFormats(profile.summary, profile.summaryFormat, 'summaryFormat', context)),
  photo: z.string().max(1500000).regex(/^(|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*)$/),
  style: styleSchema,
  sections: z.array(sectionSchema).max(24),
});

export type Resume = z.infer<typeof resumeSchema>;
export type ResumeStyle = z.infer<typeof styleSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type ResumeItem = z.infer<typeof itemSchema>;
export type SectionKind = Section['kind'];

export const defaultStyle: ResumeStyle = {
  template: 'classic', accent: '#17644e', font: 'sans', fontSize: 14,
  lineHeight: 1.55, sectionGap: 17, margin: 14, photoSize: 84,
  photoShape: 'rounded', headerAlign: 'left', showFooter: false,
};
export const sectionLabels: Record<SectionKind, string> = {
  experience: '工作经历', projects: '项目经历', education: '教育经历', skills: '专业技能', custom: '其他经历',
};
export function newItem(): ResumeItem {
  return { id: crypto.randomUUID(), title: '', subtitle: '', location: '', start: '', end: '', description: '' };
}
export function newSection(kind: SectionKind, title = sectionLabels[kind]): Section {
  return { id: crypto.randomUUID(), kind, title, visible: true, items: [newItem()] };
}
export function createBlank(): Resume {
  return {
    version: 1, id: crypto.randomUUID(), title: '我的新简历', updatedAt: new Date().toISOString(), language: 'zh',
    profile: { name: '', headline: '', email: '', phone: '', city: '', years: '', website: '', summary: '' },
    photo: '', style: { ...defaultStyle },
    sections: [newSection('experience'), newSection('projects'), newSection('education'), newSection('skills')],
  };
}
