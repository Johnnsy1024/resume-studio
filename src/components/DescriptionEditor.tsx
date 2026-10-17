import { useEffect, useId, useRef, useState } from 'react';
import { Bold, Underline, Type, RemoveFormatting } from 'lucide-react';
import type { TextFormat } from '../schema';
import type { FormatMark } from '../lib/format';
import { editFormats, editLineBullets, hasFormat, toggleFormat } from '../lib/format';
import { FormattedText } from './FormattedText';

export function DescriptionEditor({ label, value, formats = [], rows, placeholder, maxLength = 30000, paragraph = false, bullets = true, lineBullets, onLineBulletsChange, onChange }: {
  label: string; value: string; formats?: TextFormat[]; rows: number; placeholder: string; maxLength?: number; paragraph?: boolean;
  bullets?: boolean; lineBullets?: boolean[]; onLineBulletsChange?: (modes: boolean[]) => void;
  onChange: (text: string, formats: TextFormat[], group: boolean, lineBullets?: boolean[]) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ value: string; start: number; end: number; inputType: string } | null>(null);
  // 保存真实输入位置，避免相同文字的插入或删除造成格式错位。
  useEffect(() => {
    const element = ref.current!;
    const record = (event: InputEvent) => { pending.current = { value: element.value, start: element.selectionStart, end: element.selectionEnd, inputType: event.inputType }; };
    element.addEventListener('beforeinput', record);
    return () => element.removeEventListener('beforeinput', record);
  }, []);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const start = Math.min(selection.start, value.length), end = Math.min(selection.end, value.length);
  const apply = (mark: FormatMark | null) => {
    const start = ref.current!.selectionStart, end = ref.current!.selectionEnd;
    if (start === end) return;
    onChange(value, toggleFormat(formats, start, end, mark), false, lineBullets);
    ref.current!.focus();
    ref.current!.setSelectionRange(start, end);
  };
  return <div className="field field-wide description-editor">
    <label htmlFor={id}>{label}</label>
    <div className="text-format-toolbar" role="toolbar" aria-label={`${label}格式`}>
      {([{ mark: 'bold', label: '加粗', icon: Bold }, { mark: 'black', label: '加黑', icon: Type }, { mark: 'underline', label: '下划线', icon: Underline }] as const).map(button => <button key={button.mark} type="button" title={button.label} aria-label={button.label} disabled={start === end}
        aria-pressed={hasFormat(formats, start, end, button.mark)} onMouseDown={event => event.preventDefault()} onClick={() => apply(button.mark)}><button.icon size={15} /><span>{button.label}</span></button>)}
      <button type="button" title="清除选中文字的格式" aria-label="清除格式" disabled={start === end} onMouseDown={event => event.preventDefault()} onClick={() => apply(null)}><RemoveFormatting size={15} /></button>
    </div>
    <textarea id={id} ref={ref} aria-label={label} aria-describedby={`${id}-hint`} value={value} rows={rows} maxLength={maxLength} placeholder={placeholder}
      onSelect={event => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })}
      onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && ['b', 'u'].includes(event.key.toLowerCase())) {
          event.preventDefault(); apply(event.key.toLowerCase() === 'b' ? 'bold' : 'underline');
        }
      }}
      onChange={event => {
        onChange(event.target.value, editFormats(value, event.target.value, formats, pending.current?.value === value ? pending.current : undefined), true, onLineBulletsChange ? editLineBullets(value, event.target.value, lineBullets, bullets, pending.current?.value === value ? pending.current : undefined) : undefined);
        pending.current = null;
        setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd });
      }} />
    {onLineBulletsChange && <div className="paragraph-options" aria-label={`${label}逐段排版`}>
      <small>逐段排版（按回车分段）</small>
      {value.split('\n').map((line, index) => line.trim() && <label className="paragraph-option" key={index}>
        <span title={line}>{line}</span>
        <select aria-label={`第 ${index + 1} 段排版`} value={(lineBullets?.[index] ?? bullets) ? 'bullet' : 'plain'} onChange={event => {
          const modes = value.split('\n').map((_, position) => lineBullets?.[position] ?? bullets);
          modes[index] = event.target.value === 'bullet';
          onLineBulletsChange(modes);
        }}><option value="bullet">要点</option><option value="plain">普通文字</option></select>
      </label>)}
    </div>}
    <small id={`${id}-hint`}>选中文字后设置格式，可叠加使用。⌘ / Ctrl + B 加粗，⌘ / Ctrl + U 下划线。{onLineBulletsChange ? '下方可分别设置每段的排版。' : paragraph ? '换行可分段。' : ''}</small>
    {formats.length > 0 && <div className="description-format-preview"><small>格式效果</small><p><FormattedText text={value} formats={formats} /></p></div>}
  </div>;
}
