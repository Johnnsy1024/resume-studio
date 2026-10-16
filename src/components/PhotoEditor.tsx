import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Crop, Trash2, Image as ImageIcon } from 'lucide-react';
import type { ResumeStyle } from '../schema';
import { Dialog, Slider } from './ui';

type CropSource = { url: string; image: HTMLImageElement };

export function PhotoEditor({ photo, style, onPhoto, onStyle, notify }: {
  photo: string; style: ResumeStyle; onPhoto: (photo: string) => void;
  onStyle: (style: ResumeStyle) => void; notify: (text: string, error?: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const openCrop = async (url: string) => {
    const image = new window.Image();
    image.src = url;
    try { await image.decode(); setZoom(1); setX(0); setY(0); setSource({ url, image }); }
    catch { if (url.startsWith('blob:')) URL.revokeObjectURL(url); notify('无法读取图片，请选择 JPG、PNG 或 WebP。', true); }
  };
  const close = () => { if (source?.url.startsWith('blob:')) URL.revokeObjectURL(source.url); setSource(null); };
  useEffect(() => {
    if (!source || !canvas.current) return;
    const context = canvas.current.getContext('2d')!;
    const width = 480, height = 600;
    const scale = Math.max(width / source.image.naturalWidth, height / source.image.naturalHeight) * zoom;
    const scaledWidth = source.image.naturalWidth * scale, scaledHeight = source.image.naturalHeight * scale;
    const offsetX = (width - scaledWidth) / 2 + x / 100 * (scaledWidth - width) / 2;
    const offsetY = (height - scaledHeight) / 2 + y / 100 * (scaledHeight - height) / 2;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source.image, offsetX, offsetY, scaledWidth, scaledHeight);
  }, [source, zoom, x, y]);
  return <div className="editor-scroll settings-scroll">
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传简历照片"
      onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notify('请选择 JPG、PNG 或 WebP 图片。', true);
        if (file.size > 10 * 1024 * 1024) return notify('图片超过 10 MB，请先压缩。', true);
        void openCrop(URL.createObjectURL(file));
      }} />
    {photo ? <div className="photo-current"><img src={photo} alt="当前简历照片" className={`shape-${style.photoShape}`} /><p>照片已添加到简历</p><div className="button-row">
      <button className="button" onClick={() => fileRef.current!.click()}><ImagePlus size={16} />更换</button>
      <button className="button" onClick={() => void openCrop(photo)}><Crop size={16} />裁切</button>
      <button className="button danger" aria-label="移除照片" onClick={() => onPhoto('')}><Trash2 size={16} /></button>
    </div></div> : <button className="photo-upload" onClick={() => fileRef.current!.click()}><span className="upload-icon"><ImageIcon size={29} strokeWidth={1.5} /></span><strong>添加一张简历照片</strong><span>点击选择本机图片</span><small>JPG、PNG、WebP · 最大 10 MB</small></button>}
    <section className="settings-section"><h3>照片样式</h3><div className="segmented">
      {([['square', '直角'], ['rounded', '圆角'], ['circle', '圆形']] as const).map(([value, label]) => <button key={value} className={style.photoShape === value ? 'active' : ''} onClick={() => onStyle({ ...style, photoShape: value })}>{label}</button>)}
    </div><Slider label="照片尺寸" min={60} max={112} value={style.photoSize} display={`${style.photoSize} px`} onChange={value => onStyle({ ...style, photoSize: value })} /></section>
    <div className="note-box"><strong>照片是可选项</strong><p>按目标岗位和投递地区的习惯决定是否添加。建议使用背景干净、光线自然的近照。</p><p>裁切和压缩均在本机完成。</p></div>
    {source && <Dialog title="裁切照片" onClose={close}>
      <div className="crop-stage"><canvas ref={canvas} width={480} height={600} aria-label="照片裁切预览" /></div>
      <Slider label="缩放照片" min={1} max={3} step={0.02} value={zoom} display={`${zoom.toFixed(2)} 倍`} onChange={setZoom} />
      <Slider label="水平位置" min={-100} max={100} value={x} display={`${x}%`} onChange={setX} />
      <Slider label="垂直位置" min={-100} max={100} value={y} display={`${y}%`} onChange={setY} />
      <div className="dialog-actions"><button className="button" onClick={close}>取消</button><button className="button primary" onClick={() => { onPhoto(canvas.current!.toDataURL('image/jpeg', 0.9)); close(); notify('照片已添加。'); }}>使用照片</button></div>
    </Dialog>}
  </div>;
}
