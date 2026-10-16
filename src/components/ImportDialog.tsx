import { useEffect, useRef, useState } from 'react';
import { Upload, FileJson, FileUp, FileText, Check, LoaderCircle, CircleAlert, X, Image } from 'lucide-react';
import { resumeSchema } from '../schema';
import type { Resume } from '../schema';
import { importText } from '../lib/content';
import { Dialog } from './ui';

type FileResult = { resume: Resume; text: string; warnings: string[]; photos: string[]; pageCount: number | null; ocrPages: number[]; filename: string };

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (resume: Resume) => void }) {
  const [tab, setTab] = useState('file');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState('');
  const [recognized, setRecognized] = useState<FileResult | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState('');
  useEffect(() => () => abortRef.current?.abort(), []);
  const readFile = async (file: File) => {
    setError('');
    if (!/\.(docx?|pdf)$/i.test(file.name)) { setError('请选择 Word（.docx、.doc）或 PDF 文件。'); return; }
    if (!file.size) { setError('文件是空的，请重新选择。'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('文件超过 20 MB，请压缩图片或减少页数后再导入。'); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFilename(file.name); setBusy(true); setRecognized(null); setSelectedPhoto('');
    try {
      const response = await fetch(`/api/import?filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal: controller.signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '文件识别失败，请稍后重试。');
      setRecognized(value);
    } catch (error) { if ((error as Error).name !== 'AbortError') setError((error as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const finish = (value: unknown) => {
    const result = resumeSchema.safeParse(value);
    if (!result.success) { setError('这份文件不是有效的工坊备份，或内容超过限制。请选择从本工具导出的 JSON 文件。'); return; }
    onImport(result.data);
    onClose();
  };
  return <Dialog title="导入简历" onClose={onClose} wide>
    <div className="segmented import-tabs">{[['file', 'Word / PDF'], ['text', '粘贴文本'], ['json', '恢复 JSON 备份']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} disabled={busy} onClick={() => { setTab(key); setError(''); }}>{label}</button>)}</div>
    {tab === 'file' ? <div className="file-import-content">
      <p className="muted dialog-explanation">自动识别基本信息、工作与项目经历、教育和技能，重新排为可编辑的简历。</p>
      <input ref={documentRef} type="file" className="visually-hidden" accept=".docx,.doc,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="选择 Word 或 PDF 简历" disabled={busy}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file); }} />
      {!recognized && <button className={`document-upload${dragging ? ' is-dragging' : ''}${busy ? ' is-reading' : ''}`} disabled={busy} onClick={() => documentRef.current!.click()}
        onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !busy) void readFile(file); }}>
        <span className="document-upload-icon">{busy ? <LoaderCircle size={29} className="spin" /> : <FileUp size={29} strokeWidth={1.5} />}</span>
        <strong>{busy ? '正在识别简历内容…' : '点击选择，或将文件拖到这里'}</strong>
        <span>{busy ? filename : 'Word .docx / .doc　·　PDF .pdf'}</span><small>{busy ? '扫描件识别耗时较长，首次使用会准备本机识别工具。' : '最大 20 MB · 支持文字版和扫描版 PDF'}</small>
      </button>}
      {recognized && <>
        <div className="recognized-file"><span className="recognized-file-icon"><FileText size={21} /></span><div><strong>{recognized.filename}</strong><span>识别完成{recognized.pageCount ? ` · ${recognized.pageCount} 页` : ''}{recognized.ocrPages.length ? ` · ${recognized.ocrPages.length} 页扫描识别` : ''}</span></div><button className="text-button" onClick={() => documentRef.current!.click()}>更换文件</button></div>
        <div className="recognition-summary"><strong><Check size={16} />已整理为可编辑内容</strong><p>{[recognized.resume.profile.name || '姓名待补充', recognized.resume.profile.headline].filter(Boolean).join(' · ')}</p><div>{recognized.resume.sections.map(section => <span key={section.id}>{section.title} {section.items.length} 条</span>)}</div></div>
        {recognized.warnings.map((warning, index) => <p className="import-warning" key={index}><CircleAlert size={14} />{warning}</p>)}
        {recognized.photos.length > 0 && <div className="import-photos"><strong><Image size={15} />文档图片（可选作照片）</strong><div><button className={`import-photo-choice no-photo${selectedPhoto ? '' : ' selected'}`} onClick={() => setSelectedPhoto('')} aria-label="不添加文档照片" aria-pressed={!selectedPhoto}><X size={18} /><span>不添加</span></button>{recognized.photos.map((photo, index) => <button key={index} className={`import-photo-choice${selectedPhoto === photo ? ' selected' : ''}`} onClick={() => setSelectedPhoto(photo)} aria-label={`使用文档照片 ${index + 1}`} aria-pressed={selectedPhoto === photo}><img src={photo} alt={`文档图片 ${index + 1}`} />{selectedPhoto === photo && <Check size={14} />}</button>)}</div></div>}
        <details className="extracted-text"><summary>查看识别原文</summary><pre>{recognized.text}</pre></details>
      </>}
      <p className="setting-hint">文件仅在本机处理。按内容重新排版，导入后可以修改文字、模块、模板和照片。</p>
    </div> : tab === 'text' ? <>
      <p className="muted dialog-explanation">粘贴纯文本或 Markdown，用“工作经历”“项目经历”“教育经历”等标题分段。导入后可继续调整。</p>
      <textarea aria-label="简历原文" className="import-textarea" maxLength={60000} value={text} onChange={event => setText(event.target.value)} placeholder={'林知远\n产品经理\n上海 | 138 0000 0000 | lin@example.com\n\n个人简介\n介绍与你的目标岗位有关的经验。\n\n工作经历\n### 公司名称 · 产品经理\n- 负责的事情及实际结果\n\n教育经历\n### 学校名称 · 专业与学历'} />
      <p className="setting-hint">会按标题、日期和联系方式整理原文，不自动生成经历。</p>
    </> : <>
      <button className="json-upload" onClick={() => fileRef.current!.click()}><FileJson size={32} strokeWidth={1.4} /><strong>选择 JSON 备份文件</strong><span>包含简历内容、排版设置和照片</span><Upload size={18} /></button>
      <input ref={fileRef} type="file" className="visually-hidden" accept=".json,application/json" aria-label="选择 JSON 备份"
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) { setError('文件超过 8 MB，请选择本工具导出的单份备份。'); return; }
          try { finish(JSON.parse(await file.text())); } catch { setError('JSON 文件无法解析，请检查文件是否完整。'); }
        }} />
      <p className="setting-hint">导入会创建新简历，已有简历不受影响。</p>
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button" onClick={onClose}>{busy ? '取消识别' : '取消'}</button>{tab === 'file' && <button className="button primary" disabled={!recognized || busy} onClick={() => recognized && finish({ ...recognized.resume, photo: selectedPhoto })}><FileUp size={15} />导入并排版</button>}{tab === 'text' && <button className="button primary" disabled={!text.trim()} onClick={() => {
      try { finish(importText(text)); } catch (error) { setError((error as Error).message); }
    }}>整理并导入</button>}</div>
  </Dialog>;
}
