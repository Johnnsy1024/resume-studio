import type { TextFormat } from '../schema';
import { formattedRuns, formatClass } from '../lib/format';

export function FormattedText({ text, formats }: { text: string; formats?: TextFormat[] }) {
  return <>{formattedRuns(text, formats).map((run, index) => <span key={index} className={formatClass(run) || undefined}>{run.text}</span>)}</>;
}
