import { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { resumeSchema } from './schema';
import type { Resume } from './schema';
import { ResumePreview } from './components/ResumePreview';
import '@fontsource-variable/noto-sans-sc';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    return this.state.error ? <div className="loading-screen"><h1>页面暂时无法显示</h1><p>{this.state.error}</p><button className="button primary" onClick={() => location.reload()}>重新加载</button><p>已保存的简历仍在本机 data 目录中。</p></div> : this.props.children;
  }
}

function PrintView({ token }: { token: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    document.body.classList.add('print-view');
    void fetch(`/api/print/${encodeURIComponent(token)}`).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setResume(resumeSchema.parse(value.document));
    }).catch(error => setError(error.message));
    return () => document.body.classList.remove('print-view');
  }, [token]);
  return error ? <p role="alert">{error}</p> : resume ? <ResumePreview resume={resume} print /> : <p>正在排版…</p>;
}

const token = new URLSearchParams(location.search).get('print');
createRoot(document.getElementById('root')!).render(<ErrorBoundary>{token ? <PrintView token={token} /> : <App />}</ErrorBoundary>);
