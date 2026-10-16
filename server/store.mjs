import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resumeSchema } from '../src/schema.ts';

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ResumeStore {
  constructor(directory) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }
  path(id) {
    if (!validId.test(id)) throw Object.assign(new Error('简历编号无效'), { status: 400 });
    return join(this.directory, `${id}.json`);
  }
  async list() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = await readdir(this.directory);
    return Promise.all(files.filter(file => file.endsWith('.json')).sort().map(async file => {
      // 文件损坏时停止读取并保留原件，避免用空白简历覆盖用户数据。
      const result = resumeSchema.safeParse(JSON.parse(await readFile(join(this.directory, file), 'utf8')));
      if (!result.success) throw new Error(`无法读取 ${file}，请从备份恢复`);
      return result.data;
    }));
  }
  save(document) {
    const parsed = resumeSchema.parse(document);
    return this.run(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = this.path(parsed.id);
      const temporary = `${path}.${crypto.randomUUID()}.tmp`;
      // 先完整写入临时文件再替换，避免中途退出留下半份 JSON。
      await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
      try { await copyFile(path, `${path}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await rename(temporary, path);
      return parsed;
    });
  }
  remove(id) {
    return this.run(async () => {
      const path = this.path(id);
      await mkdir(join(this.directory, 'trash'), { recursive: true, mode: 0o700 });
      await rename(path, join(this.directory, 'trash', `${id}-${Date.now()}.json`));
    });
  }
  run(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
}
