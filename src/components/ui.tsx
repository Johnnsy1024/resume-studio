import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';

export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className="icon-button" type="button" title={label} aria-label={label} {...props}>{children}</button>;
}
export function Field({ label, wide, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; wide?: boolean }) {
  return <label className={`field${wide ? ' field-wide' : ''}`}><span>{label}</span><input {...props} /></label>;
}
export function TextArea({ label, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const hintId = useId();
  return <label className="field field-wide"><span>{label}</span><textarea aria-label={label} aria-describedby={hint ? hintId : undefined} {...props} />{hint && <small id={hintId}>{hint}</small>}</label>;
}
export function Slider({ label, value, display, onChange, min, max, step = 1 }: {
  label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="slider-field"><span>{label}<output>{display}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`dialog${wide ? ' dialog-wide' : ''}`} onCancel={onClose}
    onClick={event => { if (event.target === ref.current) { const box = ref.current!.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="dialog-header"><h2>{title}</h2><IconButton label="关闭窗口" onClick={onClose}><X size={19} /></IconButton></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
