import { CircleCheck, CircleAlert, Lightbulb, AlignLeft, WandSparkles } from 'lucide-react';
import type { Resume } from '../schema';
import { checkResume } from '../lib/content';

export function CheckPanel({ resume, pageCount, onClean, onFit }: { resume: Resume; pageCount: number; onClean: () => void; onFit: () => void }) {
  const checks = checkResume(resume, pageCount);
  const warnings = checks.filter(check => check.level === 'warning').length;
  return <div className="editor-scroll settings-scroll">
    <div className="check-overview"><CircleCheck size={31} strokeWidth={1.4} /><h3>{warnings ? `${warnings} 项信息需要检查` : '基本信息检查通过'}</h3><p>从完整性、描述和排版三个方面检查。</p></div>
    <div className="check-list">{checks.map((check, index) => <div className={`check-item check-${check.level}`} key={index}>
      {check.level === 'pass' ? <CircleCheck size={18} /> : check.level === 'warning' ? <CircleAlert size={18} /> : <Lightbulb size={18} />}
      <div><strong>{check.title}</strong><p>{check.detail}</p></div>
    </div>)}</div>
    <section className="settings-section"><h3>快速整理</h3>
      <button className="button full-width" onClick={onClean}><AlignLeft size={16} />统一空格与列表格式</button>
      <button className="button full-width" onClick={onFit}><WandSparkles size={16} />一键适配页面</button>
      <p className="setting-hint">这些操作只整理已有内容和版式，不生成或改写事实。可通过撤销恢复。</p>
    </section>
    <div className="note-box"><strong>写经历时，试着回答三个问题</strong><p>当时要解决什么问题？<br />你具体做了哪些事？<br />最后取得了什么结果？</p><p>只填写你能说明和核实的数据。</p></div>
  </div>;
}
