import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBlank, resumeSchema } from '../src/schema.ts';
import { createSample } from '../src/lib/sample.ts';
import { checkResume, cleanResume, descriptionLines, importText, toMarkdown } from '../src/lib/content.ts';
import { dateRange } from '../src/lib/dates.ts';
import { paginate } from '../src/lib/paginate.ts';
import { ResumeStore } from '../server/store.mjs';

test('空白和示例简历通过同一份数据校验', () => {
  assert.equal(resumeSchema.safeParse(createBlank()).success, true);
  assert.equal(resumeSchema.safeParse(createSample()).success, true);
});
test('主题值、远程照片和过大内容被拒绝', () => {
  const resume = createSample();
  assert.equal(resumeSchema.safeParse({ ...resume, style: { ...resume.style, accent: 'red;display:none' } }).success, false);
  assert.equal(resumeSchema.safeParse({ ...resume, photo: 'https://example.com/photo.png' }).success, false);
  assert.equal(resumeSchema.safeParse({ ...resume, profile: { ...resume.profile, summary: '字'.repeat(20001) } }).success, false);
});
test('列表整理保留负数、小数和正文中的数字', () => {
  assert.deepEqual(descriptionLines('-10%\n3.8 分\n- 下降 10%\n1. 增长 3 倍\n• 完成项目'), ['-10%', '3.8 分', '下降 10%', '增长 3 倍', '完成项目']);
  const resume = createSample();
  resume.sections[0].items[0].description = '  - 取得 3.8 分\n  -10%\n\n';
  assert.equal(cleanResume(resume).sections[0].items[0].description, '取得 3.8 分\n-10%');
});
test('文本导入按标题分段并保留经历原文', () => {
  const result = importText('测试用户\n后端工程师\n上海 | 138 1234 5678 | test@example.com\n个人简介\n做过高并发服务。\n工作经历\n### 示例公司 · 工程师\n- 延迟降低 25%\n教育经历\n### 示例大学 · 本科');
  assert.equal(result.profile.name, '测试用户');
  assert.equal(result.profile.email, 'test@example.com');
  assert.equal(result.profile.phone, '138 1234 5678');
  assert.equal(result.profile.city, '上海');
  assert.equal(result.sections[0].items[0].description, '- 延迟降低 25%');
  assert.equal(result.sections[1].kind, 'education');
  assert.equal(resumeSchema.safeParse(result).success, true);
});
test('Markdown 导出排除隐藏模块，检查提示日期倒置', () => {
  const resume = createSample();
  resume.sections[1].visible = false;
  assert.equal(toMarkdown(resume).includes('知学 Pro'), false);
  resume.sections[0].items[0].start = '2025.01';
  resume.sections[0].items[0].end = '2024.01';
  assert.ok(checkResume(resume, 1).some(check => check.title.includes('日期颠倒')));
});
test('分页把标题、条目名称及首段一起移动', () => {
  const blocks = [{ key: 'intro', height: 80 }, { key: 'title', height: 10, keepNext: true }, { key: 'item', height: 10, keepNext: true }, { key: 'body', height: 30 }];
  const pages = paginate(blocks, 100, () => null);
  assert.deepEqual(pages.map(page => page.map(block => block.key)), [['intro'], ['title', 'item', 'body']]);
});
test('整页边界不生成空白页', () => {
  const blocks = [{ key: 'one', height: 50 }, { key: 'two', height: 50 }];
  assert.equal(paginate(blocks, 100, () => null).length, 1);
  assert.deepEqual(paginate([], 100, () => null), [[]]);
});
test('超长正文拆页后总长度不变，每页不溢出', () => {
  const pages = paginate([{ key: 'long', height: 250, length: 250 }], 100, (block, space) => [{ ...block, height: space, length: space }, { ...block, height: block.height - space, length: block.length - space }]);
  assert.equal(pages.length, 3);
  assert.equal(pages.flat().reduce((sum, block) => sum + block.length, 0), 250);
  assert.ok(pages.every(page => page.reduce((sum, block) => sum + block.height, 0) <= 100));
});
test('本机存储支持重读、上一版备份和移入回收目录', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resume-store-'));
  try {
    const store = new ResumeStore(directory);
    const resume = createSample();
    await store.save(resume);
    await store.save({ ...resume, title: '更新名称' });
    assert.equal((await store.list())[0].title, '更新名称');
    assert.equal(JSON.parse(await readFile(join(directory, `${resume.id}.json.bak`), 'utf8')).title, resume.title);
    assert.throws(() => store.path('../escape'));
    await store.remove(resume.id);
    assert.equal((await store.list()).length, 0);
    assert.equal((await readdir(join(directory, 'trash'))).length, 1);
  } finally { await rm(directory, { recursive: true }); }
});
test('损坏文件不会被当成空白状态', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'resume-invalid-'));
  try {
    await writeFile(join(directory, 'broken.json'), '{broken');
    await assert.rejects(new ResumeStore(directory).list());
    assert.equal(await readFile(join(directory, 'broken.json'), 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true }); }
});


test('结束时间留空默认为至今，明确结束时间和未填日期保持原意', () => {
  assert.equal(dateRange('2022.03', ''), '2022.03 – 至今');
  assert.equal(dateRange('2022.03', '  '), '2022.03 – 至今');
  assert.equal(dateRange('2022.03', '', 'en'), '2022.03 – Present');
  assert.equal(dateRange('2022.03', '2024.06'), '2022.03 – 2024.06');
  assert.equal(dateRange('', ''), '');
  const resume = createSample();
  resume.sections[0].items[0].start = '2022.03';
  resume.sections[0].items[0].end = '';
  assert.ok(toMarkdown(resume).includes('2022.03 – 至今'));
});
