import { useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Eye, EyeOff, Trash2, GripVertical, ShieldCheck } from 'lucide-react';
import type { Resume, ResumeItem, Section, SectionKind } from '../schema';
import { newItem, newSection, sectionLabels } from '../schema';
import { descriptionLines } from '../lib/content';
import { Field, IconButton, TextArea } from './ui';

type Update = (change: (resume: Resume) => Resume, group?: boolean) => void;

function EntryEditor({ item, kind, onChange, onRemove, onMove, first, last }: {
  item: ResumeItem; kind: SectionKind; onChange: (item: ResumeItem) => void; onRemove: () => void;
  onMove: (direction: number) => void; first: boolean; last: boolean;
}) {
  const [open, setOpen] = useState(!item.title && !item.description);
  const change = (key: keyof ResumeItem, value: string) => onChange({ ...item, [key]: value });
  const labels = kind === 'education' ? ['学校名称', '专业与学历'] : kind === 'projects' ? ['项目名称', '担任角色'] : kind === 'skills' ? ['技能分类', '补充说明'] : kind === 'custom' ? ['标题', '副标题'] : ['公司名称', '职位名称'];
  return <div className={`entry-card${open ? ' is-editing' : ''}`}>
    <button className="entry-summary" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
      <strong>{item.title || '未命名条目'}</strong><span>{[item.start, item.end].filter(Boolean).join(' – ')}</span>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button>
    {open ? <div className="entry-form">
      <div className="form-grid">
        <Field label={labels[0]} value={item.title} maxLength={240} onChange={event => change('title', event.target.value)} />
        {kind !== 'skills' && <Field label={labels[1]} value={item.subtitle} maxLength={240} onChange={event => change('subtitle', event.target.value)} />}
        {kind !== 'skills' && <>
          <Field label="开始时间" placeholder="2021.03" value={item.start} maxLength={40} onChange={event => change('start', event.target.value)} />
          <Field label="结束时间" placeholder="至今" value={item.end} maxLength={40} onChange={event => change('end', event.target.value)} />
          <Field label="地点（选填）" value={item.location} maxLength={120} wide onChange={event => change('location', event.target.value)} />
        </>}
        <TextArea label={kind === 'skills' ? '技能内容' : '经历描述'} value={item.description} rows={kind === 'skills' ? 3 : 6} maxLength={30000}
          placeholder={kind === 'skills' ? '例如：SQL、Python、数据分析' : '每行一个要点，写清楚你做了什么、如何做、结果怎样。'}
          hint={kind === 'skills' ? undefined : '每行会自动排为一个要点，无需手动输入圆点。'} onChange={event => change('description', event.target.value)} />
      </div>
      <div className="entry-actions">
        <IconButton label="上移条目" disabled={first} onClick={() => onMove(-1)}><ArrowUp size={15} /></IconButton>
        <IconButton label="下移条目" disabled={last} onClick={() => onMove(1)}><ArrowDown size={15} /></IconButton>
        <button className="text-button danger" onClick={onRemove}><Trash2 size={14} />删除条目</button>
        <button className="text-button" onClick={() => setOpen(false)}>完成编辑</button>
      </div>
    </div> : <button type="button" className="entry-preview" onClick={() => setOpen(true)} aria-label={`编辑${item.title || '条目'}`}>
      {item.subtitle && <p>{item.subtitle}</p>}
      {kind === 'skills' ? <p className="muted">{item.description}</p> : <ul>{descriptionLines(item.description).map((line, index) => <li key={index}>{line}</li>)}</ul>}
      {!item.description && !item.subtitle && <span className="muted">点击补充内容</span>}
    </button>}
  </div>;
}

function SectionEditor({ section, onChange, onRemove, onMove, first, last }: {
  section: Section; onChange: (section: Section, group?: boolean) => void; onRemove: () => void;
  onMove: (direction: number) => void; first: boolean; last: boolean;
}) {
  const moveItem = (index: number, direction: number) => {
    const items = [...section.items];
    [items[index], items[index + direction]] = [items[index + direction], items[index]];
    onChange({ ...section, items });
  };
  return <section className={`section-editor${section.visible ? '' : ' section-hidden'}`} id={`section-${section.id}`} data-section-kind={section.kind}>
    <div className="section-heading">
      <input className="section-title-input" aria-label="模块名称" value={section.title} maxLength={80} onChange={event => onChange({ ...section, title: event.target.value }, true)} />
      <button className="button button-small" disabled={section.items.length >= 100} onClick={() => onChange({ ...section, items: [...section.items, newItem()] })}><Plus size={15} />添加</button>
    </div>
    <div className="section-tools">
      <span><GripVertical size={13} />{section.visible ? `${section.items.length} 条内容` : '已隐藏，不会导出'}</span>
      <div>
        <IconButton label={`上移${section.title}`} disabled={first} onClick={() => onMove(-1)}><ArrowUp size={14} /></IconButton>
        <IconButton label={`下移${section.title}`} disabled={last} onClick={() => onMove(1)}><ArrowDown size={14} /></IconButton>
        <IconButton label={`${section.visible ? '隐藏' : '显示'}${section.title}`} onClick={() => onChange({ ...section, visible: !section.visible })}>{section.visible ? <Eye size={14} /> : <EyeOff size={14} />}</IconButton>
        <IconButton label={`删除${section.title}`} onClick={onRemove}><Trash2 size={14} /></IconButton>
      </div>
    </div>
    {section.items.map((item, index) => <EntryEditor key={item.id} item={item} kind={section.kind} first={index === 0} last={index === section.items.length - 1}
      onChange={next => onChange({ ...section, items: section.items.map(current => current.id === next.id ? next : current) }, true)}
      onRemove={() => onChange({ ...section, items: section.items.filter(current => current.id !== item.id) })}
      onMove={direction => moveItem(index, direction)} />)}
    {!section.items.length && <div className="empty-section">还没有内容，点击“添加”开始填写。</div>}
  </section>;
}

export function ContentEditor({ resume, update }: { resume: Resume; update: Update }) {
  const [tab, setTab] = useState('profile');
  const [newKind, setNewKind] = useState<SectionKind>('custom');
  const scrollRef = useRef<HTMLDivElement>(null);
  const changeProfile = (key: keyof Resume['profile'], value: string) => update(document => ({ ...document, profile: { ...document.profile, [key]: value } }), true);
  const scroll = (kind: string) => {
    setTab(kind);
    const target = kind === 'profile' ? document.getElementById('profile-editor') : scrollRef.current!.querySelector<HTMLElement>(`[data-section-kind="${kind}"]`);
    if (target) scrollRef.current!.scrollTo({ top: target.offsetTop - scrollRef.current!.offsetTop, behavior: 'smooth' });
  };
  const moveSection = (index: number, direction: number) => update(document => {
    const sections = [...document.sections];
    [sections[index], sections[index + direction]] = [sections[index + direction], sections[index]];
    return { ...document, sections };
  });
  return <>
    <div className="content-tabs" role="tablist" aria-label="内容定位">
      {[['profile', '基本信息'], ['experience', '工作经历'], ['education', '教育经历']].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => scroll(key)}>{label}</button>)}
    </div>
    <div className="editor-scroll" ref={scrollRef}>
      <div id="profile-editor" className="profile-editor">
        <div className="form-grid">
          <Field label="姓名" value={resume.profile.name} maxLength={100} placeholder="你的姓名" onChange={event => changeProfile('name', event.target.value)} />
          <Field label="求职意向" value={resume.profile.headline} maxLength={160} placeholder="希望应聘的岗位" onChange={event => changeProfile('headline', event.target.value)} />
          <Field label="邮箱" type="email" value={resume.profile.email} maxLength={160} placeholder="you@example.com" onChange={event => changeProfile('email', event.target.value)} />
          <Field label="电话" type="tel" value={resume.profile.phone} maxLength={80} placeholder="联系电话" onChange={event => changeProfile('phone', event.target.value)} />
          <Field label="城市" value={resume.profile.city} maxLength={120} placeholder="所在城市" onChange={event => changeProfile('city', event.target.value)} />
          <Field label="工作年限" value={resume.profile.years} maxLength={80} placeholder="例如：5 年 / 应届生" onChange={event => changeProfile('years', event.target.value)} />
          <Field label="个人网站 / 作品集（选填）" value={resume.profile.website} maxLength={240} wide placeholder="例如：portfolio.example.com" onChange={event => changeProfile('website', event.target.value)} />
          <TextArea label="个人简介" value={resume.profile.summary} maxLength={20000} rows={4} placeholder="用几句话介绍与你的目标岗位最相关的经验与能力。" onChange={event => changeProfile('summary', event.target.value)} />
        </div>
      </div>
      {resume.sections.map((section, index) => <SectionEditor key={section.id} section={section} first={index === 0} last={index === resume.sections.length - 1}
        onChange={(next, group) => update(document => ({ ...document, sections: document.sections.map(current => current.id === next.id ? next : current) }), group)}
        onMove={direction => moveSection(index, direction)} onRemove={() => update(document => ({ ...document, sections: document.sections.filter(current => current.id !== section.id) }))} />)}
      <div className="add-section-row">
        <select aria-label="新模块类型" value={newKind} onChange={event => setNewKind(event.target.value as SectionKind)}>
          {Object.entries(sectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="button" disabled={resume.sections.length >= 24} onClick={() => update(document => ({ ...document, sections: [...document.sections, newSection(newKind)] }))}><Plus size={16} />添加模块</button>
      </div>
      <p className="editor-footnote">所有内容均可修改。示例中的姓名与经历仅用于演示。</p>
    </div>
    <div className="privacy-note"><ShieldCheck size={16} /><span>内容仅保存在本机，无需登录。</span></div>
  </>;
}
