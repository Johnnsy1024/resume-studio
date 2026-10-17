import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MapPin, Mail, Phone, Globe2 } from 'lucide-react';
import type { Resume, ResumeStyle, TextFormat } from '../schema';
import { descriptionSegments, sliceFormats, formattedRuns, formatClass } from '../lib/format';
import { FormattedText } from './FormattedText';
import { dateRange } from '../lib/dates';
import { paginate } from '../lib/paginate';

const MM = 96 / 25.4;
const PAGE_WIDTH = 210 * MM;
const PAGE_HEIGHT = 297 * MM;
type Block = {
  key: string; type: 'header' | 'section' | 'item' | 'paragraph' | 'bullet' | 'skill' | 'project';
  text?: string; title?: string; subtitle?: string; meta?: string; location?: string;
  keepNext?: boolean; continuation?: boolean; inlineTitle?: boolean; company?: boolean; formats?: TextFormat[];
};
type SizedBlock = Block & { height: number };

export function documentStyle(style: ResumeStyle): CSSProperties {
  return {
    '--resume-accent': style.accent, '--resume-size': `${style.fontSize}px`, '--resume-line': style.lineHeight,
    '--resume-gap': `${style.sectionGap}px`, '--resume-margin': `${style.margin}mm`,
    '--resume-photo-size': `${style.photoSize}px`,
  } as CSSProperties;
}

function blocksFor(resume: Resume): Block[] {
  const blocks: Block[] = [{ key: 'header', type: 'header' }];
  if (resume.profile.summary.trim()) {
    blocks.push({ key: 'summary-title', type: 'section', title: resume.language === 'en' ? 'Profile' : '个人简介', keepNext: true });
    // 按原文累计位置，保留空行之后的选区偏移。
    let offset = 0;
    resume.profile.summary.split('\n').forEach((text, index) => {
      if (text.trim()) blocks.push({ key: `summary-${index}`, type: 'paragraph', text, formats: sliceFormats(resume.profile.summaryFormat, offset, offset + text.length) });
      offset += text.length + 1;
    });
  }
  for (const section of resume.sections.filter(section => section.visible)) {
    const items = section.items.filter(item => [item.title, item.subtitle, item.description, item.start, item.end].some(value => value.trim()) || (section.kind === 'experience' && item.responsibilities?.trim()) || (section.kind === 'experience' && item.projects?.some(project => project.name.trim() || project.description.trim())));
    if (!items.length) continue;
    blocks.push({ key: section.id, type: 'section', title: section.title, keepNext: true });
    for (const item of items) {
      if (section.kind === 'skills') {
        blocks.push({ key: item.id, type: 'skill', title: item.title, text: item.description, formats: item.descriptionFormat });
        continue;
      }
      const bullets = item.descriptionBullets ?? section.kind !== 'custom';
      const lines = descriptionSegments(item.description, bullets, item.descriptionLineBullets);
      if (item.title || item.subtitle || item.start || item.end || item.location) blocks.push({
        key: item.id, type: 'item', company: section.kind === 'experience', inlineTitle: section.kind === 'experience' || section.kind === 'education', title: item.title, subtitle: item.subtitle,
        meta: dateRange(item.start, item.end, resume.language), location: item.location, keepNext: (section.kind === 'experience' && !!item.responsibilities?.trim()) || lines.length > 0 || !!item.projects?.some(project => project.name.trim() || project.description.trim()),
      });
      // 职责作为普通段落独立参与分页，长内容仍能正常跨页。
      if (section.kind === 'experience') descriptionSegments(item.responsibilities || '', false).forEach((line, index) => blocks.push({
        key: `${item.id}-responsibilities-${index}`, type: 'paragraph', text: line.text, formats: sliceFormats(item.responsibilitiesFormat, line.start, line.end),
      }));
      lines.forEach((line, index) => blocks.push({ key: `${item.id}-${index}`, type: line.bullet ? 'bullet' : 'paragraph', text: line.text, formats: sliceFormats(item.descriptionFormat, line.start, line.end) }));
      if (section.kind === 'experience') for (const project of item.projects || []) {
        const details = descriptionSegments(project.description, project.descriptionBullets ?? true, project.descriptionLineBullets);
        // 项目名独立成行，并尽量与后面的首条描述排在同一页。
        if (project.name.trim()) blocks.push({ key: `${item.id}-${project.id}-title`, type: 'project', text: project.name, keepNext: details.length > 0 });
        details.forEach((line, index) => blocks.push({ key: `${item.id}-${project.id}-${index}`, type: line.bullet ? 'bullet' : 'paragraph', text: line.text, formats: sliceFormats(project.descriptionFormat, line.start, line.end) }));
      }
    }
  }
  return blocks;
}

function ResumeHeader({ resume }: { resume: Resume }) {
  const { profile, style } = resume;
  return <header className={`resume-header align-${style.headerAlign}`}>
    <div className="resume-topline"><span /><b>{resume.language === 'en' ? 'RÉSUMÉ' : '简 历'}</b></div>
    <div className="resume-header-main">
      <div className="resume-identity">
        {profile.name && <h1>{profile.name}</h1>}
        {profile.headline && <div className="resume-headline">{profile.headline}</div>}
        <div className="resume-contact">
          {profile.city && <span><MapPin />{profile.city}</span>}
          {profile.phone && <span><Phone />{profile.phone}</span>}
          {profile.email && <span><Mail />{profile.email}</span>}
          {profile.website && <span><Globe2 />{profile.website}</span>}
          {profile.years && <span>{profile.years}{resume.language === 'en' ? ' experience' : '工作经验'}</span>}
        </div>
      </div>
      {resume.photo && <img className={`resume-photo shape-${style.photoShape}`} src={resume.photo} alt="简历照片" />}
    </div>
  </header>;
}

function ResumeBlock({ block, resume }: { block: Block; resume: Resume }) {
  const className = `resume-block block-${block.type}${block.continuation ? ' continuation' : ''}`;
  if (block.type === 'header') return <div className={className}><ResumeHeader resume={resume} /></div>;
  if (block.type === 'section') return <div className={className}><h2>{block.title}</h2></div>;
  if (block.type === 'item' && block.inlineTitle) return <div className={className}>
    <div className="resume-item-row resume-work-heading">
      <div className="resume-work-identity"><h3 className={block.company ? 'resume-company-name' : undefined}>{block.title}</h3>{block.subtitle && <span className="resume-work-role">{block.subtitle}</span>}</div>
      <span>{block.meta}{block.location && <small className="resume-work-location">{block.location}</small>}</span>
    </div>
  </div>;
  if (block.type === 'item') return <div className={className}>
    <div className="resume-item-row"><h3>{block.title}</h3><span>{block.meta}</span></div>
    {(block.subtitle || block.location) && <div className="resume-item-row"><p>{block.subtitle}</p><span>{block.location}</span></div>}
  </div>;
  const text = <FormattedText text={block.text || ''} formats={block.formats} />;
  if (block.type === 'skill') return <div className={className}>
    <span className="bullet-dot">•</span><span className="block-text">{block.title ? <><b>{block.title}：</b>{text}</> : text}</span>
  </div>;
  return <div className={className}>{block.type === 'bullet' && <span className="bullet-dot">•</span>}<span className="block-text">{text}</span></div>;
}

function capacityFor(style: ResumeStyle) {
  return PAGE_HEIGHT - style.margin * MM * 2 - (style.showFooter ? 24 : 0) - 1;
}

export type PreviewHandle = { fit: () => { style: ResumeStyle; fits: boolean } };
type Props = { resume: Resume; zoom?: number; onPages?: (count: number) => void; print?: boolean };

export const ResumePreview = forwardRef<PreviewHandle, Props>(function ResumePreview({ resume, zoom = 1, onPages, print = false }, ref) {
  const measureRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => blocksFor(resume), [resume]);
  const [pages, setPages] = useState<SizedBlock[][]>([]);
  const [ready, setReady] = useState(false);
  const classes = `resume-document template-${resume.style.template} font-${resume.style.font}`;

  useLayoutEffect(() => {
    const root = measureRef.current!;
    setReady(false);
    let cancelled = false;
    const calculate = async () => {
      await document.fonts.ready;
      if (cancelled) return;
      const nodes = Array.from(root.children) as HTMLElement[];
      const sized = blocks.map((block, index) => ({ ...block, height: nodes[index].getBoundingClientRect().height }));
      const nodeByKey = new Map(nodes.map((node, index) => [blocks[index].key, node]));
      const measure = (block: SizedBlock, text: string, formats = block.formats) => {
        const original = nodeByKey.get(block.key.split(':part')[0]);
        if (!original) return Number.POSITIVE_INFINITY;
        const clone = original.cloneNode(true) as HTMLElement;
        const content = clone.querySelector('.block-text')!;
        // 测量时保留局部字重，避免加粗后分页宽度与实际渲染不一致。
        content.replaceChildren(...formattedRuns(text, formats).map(run => {
          const span = document.createElement('span');
          span.className = formatClass(run);
          span.textContent = run.text;
          return span;
        }));
        if (block.type === 'skill' && block.title && !block.continuation) {
          const title = document.createElement('b');
          title.textContent = `${block.title}：`;
          content.prepend(title);
        }
        root.appendChild(clone);
        const height = clone.getBoundingClientRect().height;
        clone.remove();
        return height;
      };
      const next = paginate(sized, capacityFor(resume.style), (block, space) => {
        if (!['bullet', 'paragraph', 'skill'].includes(block.type) || !block.text || block.text.length < 2) return null;
        // 二分查找当前字体下能放入页面的最长片段，中文和长网址也能换页。
        const characters = Array.from(block.text);
        let low = 1, high = characters.length - 1, count = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const part = characters.slice(0, middle).join('');
          if (measure(block, part, sliceFormats(block.formats, 0, part.length)) <= space - 0.5) { count = middle; low = middle + 1; }
          else high = middle - 1;
        }
        if (!count) return null;
        const candidate = characters.slice(0, count).join('');
        const whitespace = candidate.lastIndexOf(' ');
        if (whitespace > candidate.length * 0.7) count = Array.from(candidate.slice(0, whitespace + 1)).length;
        const firstText = characters.slice(0, count).join('');
        const restText = characters.slice(count).join('');
        const first = { ...block, text: firstText, formats: sliceFormats(block.formats, 0, firstText.length), keepNext: false };
        const rest = { ...block, key: `${block.key}:part`, title: undefined, continuation: true, text: restText, formats: sliceFormats(block.formats, firstText.length, block.text.length), keepNext: false };
        return [
          { ...first, height: measure(first, firstText) },
          { ...rest, height: measure(rest, restText) },
        ];
      });
      setPages(next);
      onPages?.(next.length);
      setReady(true);
    };
    void calculate();
    return () => { cancelled = true; };
  }, [blocks, resume, onPages]);

  useEffect(() => {
    if (!print || !ready) return;
    let stopped = false;
    void (async () => {
      await document.fonts.ready;
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('.resume-pages img'));
      await Promise.all(images.map(image => image.decode()));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!stopped) window.__resumeReady = true;
    })();
    return () => { stopped = true; window.__resumeReady = false; };
  }, [print, ready, pages]);

  useImperativeHandle(ref, () => ({ fit: () => {
    const original = measureRef.current!;
    const clone = original.cloneNode(true) as HTMLElement;
    const container = original.parentElement!.cloneNode(false) as HTMLElement;
    container.appendChild(clone);
    document.body.appendChild(container);
    const base = resume.style;
    let chosen = { ...base }, fits = false;
    try {
      for (let step = 0; step <= 24; step++) {
        chosen = { ...base,
          sectionGap: Math.max(8, base.sectionGap - step), margin: Math.max(12, base.margin - step * 0.3),
          fontSize: Math.max(10, base.fontSize - Math.max(0, step - 7) * 0.18),
          lineHeight: Math.max(1.25, base.lineHeight - step * 0.018),
        };
        for (const [key, value] of Object.entries(documentStyle(chosen))) container.style.setProperty(key, String(value));
        container.style.width = `${PAGE_WIDTH - chosen.margin * MM * 2}px`;
        const total = Array.from(clone.children).reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
        if (total <= capacityFor(chosen)) { fits = true; break; }
      }
    } finally { container.remove(); }
    return { style: chosen, fits };
  } }), [resume.style]);

  return <>
    <div className={`measurement ${classes}`} style={{ ...documentStyle(resume.style), width: PAGE_WIDTH - resume.style.margin * MM * 2 }} aria-hidden="true">
      <div ref={measureRef}>{blocks.map(block => <ResumeBlock key={block.key} block={block} resume={resume} />)}</div>
    </div>
    <div className="resume-pages" data-ready={ready}>
      {pages.map((page, index) => <div className="sheet-frame" key={index} style={print ? undefined : { width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}>
        <article className={`resume-sheet ${classes}`} aria-label={`简历第 ${index + 1} 页`}
          style={{ ...documentStyle(resume.style), transform: print ? undefined : `scale(${zoom})` }}>
          <div className="sheet-content" style={{ height: capacityFor(resume.style) }}>
            {page.map(block => <ResumeBlock key={block.key} block={block} resume={resume} />)}
          </div>
          {resume.style.showFooter && <footer className="resume-footer"><span>{resume.profile.name}</span><span>{index + 1} / {pages.length}</span></footer>}
        </article>
      </div>)}
    </div>
  </>;
});

declare global { interface Window { __resumeReady?: boolean } }
