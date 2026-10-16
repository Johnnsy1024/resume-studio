import { useEffect, useRef, useState } from 'react';
import { FileText, Paintbrush, Image, CircleCheck, CircleHelp, Download, Upload, Check, LoaderCircle, MoreHorizontal,
  Minus, Plus, Maximize2, WandSparkles, Undo2, Redo2, Pencil, Copy, Trash2, FileJson, FileDown, Printer, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { createBlank } from './schema';
import { useWorkspace } from './lib/useWorkspace';
import { createSample } from './lib/sample';
import { cleanResume, download, toMarkdown } from './lib/content';
import { ContentEditor } from './components/ContentEditor';
import { AppearanceEditor } from './components/AppearanceEditor';
import { PhotoEditor } from './components/PhotoEditor';
import { CheckPanel } from './components/CheckPanel';
import { ImportDialog } from './components/ImportDialog';
import { ResumePreview } from './components/ResumePreview';
import type { PreviewHandle } from './components/ResumePreview';
import { Dialog, Field, IconButton } from './components/ui';

const modes = [
  { id: 'content', label: '内容', icon: FileText, title: '简历内容', hint: '把经历写清楚，让优势被看见。' },
  { id: 'appearance', label: '外观', icon: Paintbrush, title: '外观设置', hint: '找到适合你的表达方式。' },
  { id: 'photo', label: '照片', icon: Image, title: '简历照片', hint: '自然、清晰，留下好印象。' },
  { id: 'check', label: '检查', icon: CircleCheck, title: '简历检查', hint: '投递之前，再仔细看一遍。' },
];

export default function App() {
  const workspace = useWorkspace();
  const [mode, setMode] = useState('content');
  const [mobileView, setMobileView] = useState('edit');
  const [modal, setModal] = useState('');
  const [rename, setRename] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(0.74);
  const [zoomManual, setZoomManual] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewRef = useRef<PreviewHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { active: resume } = workspace;
  const selectedMode = modes.find(item => item.id === mode)!;
  const notify = (text: string, error = false) => { clearTimeout(toastTimer.current); setToast({ text, error }); toastTimer.current = setTimeout(() => setToast(null), error ? 7000 : 4000); };

  useEffect(() => {
    if (resume) document.title = `${resume.profile.name || resume.title} · 简历工坊`;
  }, [resume?.title, resume?.profile.name]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || zoomManual) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setZoom(Math.max(0.3, Math.min(0.84, (entry.contentRect.width - 8) / (210 * 96 / 25.4), (entry.contentRect.height - 30) / (297 * 96 / 25.4))));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [workspace.loading, zoomManual, mobileView]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void workspace.flush().then(() => notify('已保存到本机。')).catch(error => notify(error.message, true)); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });

  const fit = () => {
    const result = previewRef.current?.fit();
    if (!result) return;
    workspace.update(document => ({ ...document, style: result.style }));
    notify(result.fits ? '已调整为单页排版，内容完整保留。' : '已压缩间距和字号，内容仍需多页。可精简经历后再次适配。');
  };
  const exportPdf = async () => {
    if (!resume || exporting) return;
    setExporting(true);
    try {
      const response = await fetch('/api/export/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resume) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'PDF 导出失败'); }
      download(await response.blob(), `${resume.profile.name || resume.title}-简历.pdf`, 'application/pdf');
      notify('PDF 已导出，文字可以选择和复制。');
    } catch (error) { notify((error as Error).message, true); }
    finally { setExporting(false); }
  };

  if (workspace.loading) return <div className="loading-screen"><FileText size={35} /><h1>简历工坊</h1><p><LoaderCircle className="spin" size={15} />正在读取本机简历…</p></div>;
  if (workspace.loadError || !resume) return <div className="loading-screen"><AlertCircle size={35} /><h1>暂时无法读取简历</h1><p>{workspace.loadError}</p><button className="button primary" onClick={() => void workspace.reload()}>重新连接</button></div>;

  const closeMenu = (event: React.MouseEvent) => event.currentTarget.closest('details')?.removeAttribute('open');
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="简历工坊首页"><span className="brand-mark"><FileText size={20} strokeWidth={1.7} /></span><strong>简历工坊</strong></a>
      <div className="breadcrumb"><span>我的简历</span><i>/</i><b>{resume.title}</b></div>
      <div className={`save-status${workspace.saveError ? ' status-error' : ''}`} role="status">
        {workspace.saveError ? <button onClick={() => void workspace.flush().catch(error => notify(error.message, true))} title={workspace.saveError}><AlertCircle size={14} />保存失败，重试</button> : workspace.saving ? <><LoaderCircle size={14} className="spin" /><span>正在保存</span></> : <><Check size={16} /><span>已保存{workspace.savedAt ? ` ${workspace.savedAt}` : ''}</span></>}
      </div>
      <div className="header-actions"><button className="button import-button" onClick={() => setModal('import')}><Upload size={15} /><span>导入</span></button>
        <button className="button primary export-button" onClick={() => void exportPdf()} disabled={exporting}>{exporting ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}<span>{exporting ? '正在导出…' : '导出 PDF'}</span></button>
        <details className="more-menu"><summary aria-label="更多操作"><MoreHorizontal size={20} /></summary><div className="menu-panel" onClick={closeMenu}>
          <button onClick={() => { setRename(resume.title); setModal('rename'); }}><Pencil size={15} />重命名简历</button>
          <button onClick={() => { workspace.add({ ...resume, title: `${resume.title.slice(0, 110)} · 副本` }); notify('已创建副本。'); }}><Copy size={15} />复制一份</button>
          <hr /><button onClick={() => download(JSON.stringify(resume, null, 2), `${resume.profile.name || resume.title}-备份.json`, 'application/json')}><FileJson size={15} />备份 JSON</button>
          <button onClick={() => download(toMarkdown(resume), `${resume.profile.name || resume.title}-简历.md`, 'text/markdown;charset=utf-8')}><FileDown size={15} />导出 Markdown</button>
          <button onClick={() => window.print()}><Printer size={15} />浏览器打印</button>
          <hr /><button className="danger" onClick={() => setModal('delete')}><Trash2 size={15} />删除当前简历</button>
        </div></details>
      </div>
    </header>
    <div className="mobile-view-switch"><button className={mobileView === 'edit' ? 'active' : ''} onClick={() => setMobileView('edit')}>编辑简历</button><button className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>A4 预览 · {pageCount} 页</button></div>
    <div className={`app-body mobile-${mobileView}`}>
      <nav className="mode-nav" aria-label="编辑工具">
        <div>{modes.map(item => <button key={item.id} className={mode === item.id ? 'active' : ''} onClick={() => { setMode(item.id); setMobileView('edit'); }} aria-current={mode === item.id ? 'page' : undefined}><item.icon size={21} strokeWidth={1.7} /><span>{item.label}</span></button>)}</div>
        <button onClick={() => setModal('help')}><CircleHelp size={21} strokeWidth={1.7} /><span>帮助</span></button>
      </nav>
      <aside className="editor-panel" aria-label="简历编辑区">
        <div className="editor-panel-header"><h1>{selectedMode.title}</h1><p>{selectedMode.hint}</p>
          <div className="document-picker"><select aria-label="选择简历" value={resume.id} onChange={event => {
            const value = event.target.value;
            if (value === '__blank') { workspace.add(createBlank()); setMode('content'); }
            else if (value === '__sample') { workspace.add(createSample()); setMode('content'); }
            else workspace.select(value);
          }}>{workspace.documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}<option disabled>──────────</option><option value="__blank">＋ 新建空白简历</option><option value="__sample">＋ 从示例创建</option></select>
            <IconButton label="重命名简历" onClick={() => { setRename(resume.title); setModal('rename'); }}><Pencil size={15} /></IconButton>
          </div>
        </div>
        {mode === 'content' && <ContentEditor key={resume.id} resume={resume} update={workspace.update} />}
        {mode === 'appearance' && <AppearanceEditor resume={resume} onChange={style => workspace.update(document => ({ ...document, style }))} onLanguage={language => workspace.update(document => ({ ...document, language }))} />}
        {mode === 'photo' && <PhotoEditor key={resume.id} photo={resume.photo} style={resume.style} onPhoto={photo => workspace.update(document => ({ ...document, photo }))} onStyle={style => workspace.update(document => ({ ...document, style }))} notify={notify} />}
        {mode === 'check' && <CheckPanel resume={resume} pageCount={pageCount} onClean={() => { workspace.update(cleanResume); notify('已统一空格与列表格式，原有内容保留。'); }} onFit={fit} />}
      </aside>
      <main className="preview-workspace" ref={workspaceRef}>
        <div className="preview-toolbar"><div className="preview-title"><strong>简历预览</strong><span>A4 · {pageCount} 页</span></div>
          <div className="preview-controls">
            <div className="history-controls"><IconButton label="撤销" disabled={!workspace.canUndo} onClick={workspace.undo}><Undo2 size={16} /></IconButton><IconButton label="重做" disabled={!workspace.canRedo} onClick={workspace.redo}><Redo2 size={16} /></IconButton></div>
            <IconButton label="缩小预览" disabled={zoom <= 0.3} onClick={() => { setZoomManual(true); setZoom(current => Math.max(0.3, current - 0.1)); }}><Minus size={15} /></IconButton>
            <button className="zoom-reset" title="自动缩放预览" onClick={() => setZoomManual(false)}>{Math.round(zoom * 100)}%</button>
            <IconButton label="放大预览" disabled={zoom >= 1.3} onClick={() => { setZoomManual(true); setZoom(current => Math.min(1.3, current + 0.1)); }}><Plus size={15} /></IconButton>
            <button className="button button-small fit-button" onClick={fit}><WandSparkles size={14} /><span>一键适配</span></button>
            <IconButton label="全屏预览" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void workspaceRef.current!.requestFullscreen().catch(() => notify('当前浏览器不支持全屏，请使用放大预览。')); }}><Maximize2 size={15} /></IconButton>
          </div>
        </div>
        <div className="preview-stage" ref={stageRef}><ResumePreview ref={previewRef} resume={resume} zoom={zoom} onPages={setPageCount} /><p className="preview-hint">在左侧编辑，预览会实时更新。</p></div>
        <div className="local-status"><span />本地服务运行中</div>
      </main>
    </div>
    {toast && <div className={`toast${toast.error ? ' toast-error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <AlertCircle size={17} /> : <Check size={17} />}<span>{toast.text}</span><button aria-label="关闭提示" onClick={() => setToast(null)}><X size={15} /></button></div>}
    {modal === 'import' && <ImportDialog onClose={() => setModal('')} onImport={document => { workspace.add(document); setMode('content'); setMobileView('edit'); notify('已导入为一份新简历。'); }} />}
    {modal === 'rename' && <Dialog title="重命名简历" onClose={() => setModal('')}><form onSubmit={event => { event.preventDefault(); if (rename.trim()) { workspace.update(document => ({ ...document, title: rename.trim() })); setModal(''); } }}><Field label="简历名称" value={rename} maxLength={120} onChange={event => setRename(event.target.value)} autoFocus /><div className="dialog-actions"><button type="button" className="button" onClick={() => setModal('')}>取消</button><button className="button primary" disabled={!rename.trim()}>保存名称</button></div></form></Dialog>}
    {modal === 'delete' && <Dialog title="删除这份简历？" onClose={() => setModal('')}><p>将删除“{resume.title}”。建议先导出 JSON 备份。删除的文件会保留在本机 data/trash 目录。</p><div className="dialog-actions"><button className="button" onClick={() => setModal('')}>取消</button><button className="button destructive" onClick={() => void workspace.remove().then(() => { setModal(''); notify('已删除当前简历。'); }).catch(error => notify(error.message, true))}>确认删除</button></div></Dialog>}
    {modal === 'help' && <Dialog title="使用简历工坊" onClose={() => setModal('')}><div className="help-content">
      <p>在左侧修改内容，右侧会按 A4 纸张实时排版。点击经历条目即可编辑；用箭头调整模块和条目的顺序。</p>
      <p>在“外观”中选择模板、字体和主题色，在“照片”中上传并裁切图片。“一键适配”会压缩间距与字号，尽量排为一页，保留全部内容。</p>
      <p>“导出 PDF”会生成可选择、可复制文字的文件。需要本机已安装 Chrome 或 Edge。也可以在更多操作中选择浏览器打印，纸张选择 A4、缩放 100%，关闭浏览器自带页眉页脚。</p>
      <p>内容自动保存到本机文件，刷新后继续编辑。更多操作可导出 JSON 备份、Markdown 文本，或复制当前简历。JSON 备份可在“导入”中恢复。</p>
      <p>“导入 → Word / PDF”可识别 .docx、.doc 和 PDF 简历，按内容重新排为可编辑模块。扫描版 PDF 使用 macOS 本机文字识别。文档中的照片可在识别后选用。</p>
      <div className="note-box"><ShieldCheck size={19} /><p>无需账号。服务只监听本机地址，照片和内容均在本机处理。首次安装依赖需要联网，使用时无需联网。</p></div>
      <p className="muted">快捷键：⌘ / Ctrl + S 保存。编辑区上方的撤销、重做按钮可以恢复内容及外观修改。</p>
    </div></Dialog>}
  </div>;
}
