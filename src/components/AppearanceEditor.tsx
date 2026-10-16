import { Check, RotateCcw } from 'lucide-react';
import { defaultStyle } from '../schema';
import type { Resume, ResumeStyle } from '../schema';
import { Slider } from './ui';

const templates: { id: ResumeStyle['template']; title: string; description: string }[] = [
  { id: 'classic', title: '经典专业', description: '清晰稳重，适合多数岗位' },
  { id: 'minimal', title: '极简留白', description: '黑白层次，突出经历' },
  { id: 'editorial', title: '雅致书写', description: '衬线字体，注重文字质感' },
  { id: 'technical', title: '理性技术', description: '紧凑结构，适合技术岗位' },
];
const colors = ['#17644e', '#264a73', '#725470', '#a1553e', '#292d33', '#1a7985'];

export function AppearanceEditor({ resume, onChange, onLanguage }: { resume: Resume; onChange: (style: ResumeStyle) => void; onLanguage: (language: Resume['language']) => void }) {
  const { style } = resume;
  const change = <K extends keyof ResumeStyle>(key: K, value: ResumeStyle[K]) => onChange({ ...style, [key]: value });
  return <div className="editor-scroll settings-scroll">
    <section className="settings-section"><h3>选择版式</h3><div className="template-grid">
      {templates.map(template => <button key={template.id} className={`template-choice${style.template === template.id ? ' selected' : ''}`} onClick={() => onChange({ ...style, template: template.id, font: template.id === 'editorial' ? 'serif' : 'sans' })} aria-pressed={style.template === template.id}>
        <div className={`template-mini mini-${template.id}`} style={{ '--mini-accent': style.accent } as React.CSSProperties} aria-hidden="true">
          <div className="mini-header"><i /><i /></div><div className="mini-contact" />
          {[1, 2, 3].map(index => <div className="mini-section" key={index}><b /><i /><i /><i /></div>)}
        </div>
        <span className="template-name">{template.title}{style.template === template.id && <Check size={14} />}</span><small>{template.description}</small>
      </button>)}
    </div></section>
    <section className="settings-section"><h3>主题颜色</h3><div className="color-row">
      {colors.map(color => <button key={color} aria-label={`主题色 ${color}`} aria-pressed={style.accent === color} className="color-swatch" style={{ background: color }} onClick={() => change('accent', color)}>{style.accent === color && <Check size={16} />}</button>)}
      <label className="custom-color" title="自定义主题色"><input type="color" aria-label="自定义主题色" value={style.accent} onChange={event => change('accent', event.target.value)} /><span>自选</span></label>
    </div></section>
    <section className="settings-section"><h3>字体与排版</h3>
      <label className="field"><span>字体</span><select aria-label="字体" value={style.font} onChange={event => change('font', event.target.value as ResumeStyle['font'])}>
        <option value="sans">内置黑体 · Noto Sans SC</option><option value="serif">经典宋体 · 系统衬线</option><option value="mono">等宽字体 · 技术风格</option>
      </select></label>
      <Slider label="正文字号" min={10} max={16} step={0.25} value={style.fontSize} display={`${Number(style.fontSize.toFixed(2))} px`} onChange={value => change('fontSize', value)} />
      <Slider label="行间距" min={1.25} max={1.9} step={0.05} value={style.lineHeight} display={`${style.lineHeight.toFixed(2)} 倍`} onChange={value => change('lineHeight', value)} />
      <Slider label="模块间距" min={8} max={32} value={style.sectionGap} display={`${Math.round(style.sectionGap)} px`} onChange={value => change('sectionGap', value)} />
      <Slider label="页边距" min={12} max={28} step={0.5} value={style.margin} display={`${Number(style.margin.toFixed(1))} mm`} onChange={value => change('margin', value)} />
      <label className="field"><span>个人信息对齐</span><select aria-label="个人信息对齐" value={style.headerAlign} onChange={event => change('headerAlign', event.target.value as ResumeStyle['headerAlign'])}><option value="left">左对齐</option><option value="center">居中</option></select></label>
      <label className="checkbox-row"><input type="checkbox" checked={style.showFooter} onChange={event => change('showFooter', event.target.checked)} /><span>显示姓名和页码</span></label>
    </section>
    <section className="settings-section"><h3>简历语言</h3><div className="segmented">
      <button className={resume.language === 'zh' ? 'active' : ''} onClick={() => onLanguage('zh')}>中文</button><button className={resume.language === 'en' ? 'active' : ''} onClick={() => onLanguage('en')}>English</button>
    </div><p className="setting-hint">切换页眉及简介标题；经历和模块名称可自行填写英文。</p></section>
    <button className="button full-width" onClick={() => onChange({ ...defaultStyle })}><RotateCcw size={15} />恢复默认外观</button>
  </div>;
}
