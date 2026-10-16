import { useCallback, useEffect, useRef, useState } from 'react';
import { resumeSchema } from '../schema';
import type { Resume } from '../schema';
import { createSample } from './sample';

const draftPrefix = 'resume-studio-v1-draft-';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '本地服务不可用');
  return value;
}

export function useWorkspace() {
  const [documents, setDocuments] = useState<Resume[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const latest = useRef<Resume[]>([]);
  const dirty = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const history = useRef(new Map<string, { past: Resume[]; future: Resume[]; last: number }>());
  const [historyVersion, setHistoryVersion] = useState(0);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const task = queue.current.then(async () => {
      if (!dirty.current.size) return;
      setSaving(true);
      setSaveError('');
      try {
        for (const id of [...dirty.current]) {
          const snapshot = latest.current.find(document => document.id === id);
          if (!snapshot) { dirty.current.delete(id); continue; }
          await request('/api/resumes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
          if (latest.current.find(document => document.id === id) === snapshot) {
            dirty.current.delete(id);
            try { localStorage.removeItem(`${draftPrefix}${id}`); } catch { /* 磁盘保存成功后，浏览器缓存可在下次加载时清理。 */ }
          }
        }
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      } catch (error) {
        setSaveError((error as Error).message);
        throw error;
      } finally { setSaving(dirty.current.size > 0); }
    });
    queue.current = task.catch(() => {});
    return task;
  }, []);

  const markDirty = useCallback((document: Resume) => {
    dirty.current.add(document.id);
    // 浏览器草稿覆盖自动保存的短暂等待，刷新后仍可恢复最后一次编辑。
    try { localStorage.setItem(`${draftPrefix}${document.id}`, JSON.stringify(document)); }
    catch { /* 浏览器空间不足时继续保存到本机文件，失败会在界面中显示。 */ }
    setSaving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 600);
  }, [flush]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await request<{ documents: unknown[] }>('/api/resumes');
      const loaded = result.documents.map(value => resumeSchema.parse(value));
      const byId = new Map(loaded.map(document => [document.id, document]));
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)!;
        if (!key.startsWith(draftPrefix)) continue;
        try {
          const parsed = resumeSchema.safeParse(JSON.parse(localStorage.getItem(key)!));
          if (parsed.success && (!byId.has(parsed.data.id) || parsed.data.updatedAt > byId.get(parsed.data.id)!.updatedAt)) {
            byId.set(parsed.data.id, parsed.data);
            dirty.current.add(parsed.data.id);
          }
        } catch { /* 无效缓存不替换磁盘上的有效简历。 */ }
      }
      if (!byId.size) { const sample = createSample(); byId.set(sample.id, sample); dirty.current.add(sample.id); }
      const next = [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      latest.current = next;
      setDocuments(next);
      const remembered = localStorage.getItem('resume-studio-active');
      setActiveId(next.some(document => document.id === remembered) ? remembered! : next[0].id);
      if (dirty.current.size) { setSaving(true); timer.current = setTimeout(() => { void flush().catch(() => {}); }, 50); }
    } catch (error) { setLoadError((error as Error).message); }
    finally { setLoading(false); }
  }, [flush]);

  useEffect(() => { void load(); return () => clearTimeout(timer.current); }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) { event.preventDefault(); void flush().catch(() => {}); }
    };
    window.addEventListener('beforeunload', warn);
    const retry = () => { void flush().catch(() => {}); };
    window.addEventListener('online', retry);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('online', retry); };
  }, [flush]);

  const select = (id: string) => { setActiveId(id); try { localStorage.setItem('resume-studio-active', id); } catch { /* 当前会话仍可切换。 */ } };
  const update = (change: (document: Resume) => Resume, group = false) => {
    const current = latest.current.find(document => document.id === activeId);
    if (!current) return;
    const entry = history.current.get(activeId) || { past: [], future: [], last: 0 };
    if (!group || Date.now() - entry.last > 700) entry.past = [...entry.past.slice(-39), current];
    entry.future = [];
    entry.last = group ? Date.now() : 0;
    history.current.set(activeId, entry);
    const next = { ...change(current), updatedAt: new Date().toISOString() };
    latest.current = latest.current.map(document => document.id === activeId ? next : document);
    setDocuments(latest.current);
    setHistoryVersion(version => version + 1);
    markDirty(next);
  };
  const add = (document: Resume) => {
    const copy = { ...document, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    latest.current = [copy, ...latest.current];
    setDocuments(latest.current);
    select(copy.id);
    markDirty(copy);
    return copy;
  };
  const remove = async () => {
    await flush();
    await request(`/api/resumes/${activeId}`, { method: 'DELETE' });
    const next = latest.current.filter(document => document.id !== activeId);
    latest.current = next;
    setDocuments(next);
    if (next.length) select(next[0].id);
    else add(createSample());
  };
  const travel = (direction: 'undo' | 'redo') => {
    const entry = history.current.get(activeId);
    const current = latest.current.find(document => document.id === activeId);
    if (!entry || !current) return;
    const from = direction === 'undo' ? entry.past : entry.future;
    const target = from.pop();
    if (!target) return;
    (direction === 'undo' ? entry.future : entry.past).push(current);
    entry.last = 0;
    const next = { ...target, updatedAt: new Date().toISOString() };
    latest.current = latest.current.map(document => document.id === activeId ? next : document);
    setDocuments(latest.current);
    setHistoryVersion(version => version + 1);
    markDirty(next);
  };
  void historyVersion;
  return { documents, active: documents.find(document => document.id === activeId), activeId, loading, loadError, saveError,
    saving, savedAt, select, update, add, remove, flush, reload: load, undo: () => travel('undo'), redo: () => travel('redo'),
    canUndo: Boolean(history.current.get(activeId)?.past.length), canRedo: Boolean(history.current.get(activeId)?.future.length) };
}
