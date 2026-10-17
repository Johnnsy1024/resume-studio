import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSample } from '../src/lib/sample.ts';
import { resumeSchema } from '../src/schema.ts';
import { cleanResume, toMarkdown, descriptionLines } from '../src/lib/content.ts';
import { toggleFormat, hasFormat, editFormats, sliceFormats, formattedRuns, descriptionSegments } from '../src/lib/format.ts';

const span = (start, end, marks = {}) => ({ start, end, bold: false, black: false, underline: false, ...marks });

test('选区格式可叠加、取消和局部清除，其他文字不受影响', () => {
  let formats = toggleFormat([], 2, 8, 'bold');
  formats = toggleFormat(formats, 5, 10, 'underline');
  formats = toggleFormat(formats, 6, 7, 'black');
  assert.deepEqual(formats, [span(2, 5, { bold: true }), span(5, 6, { bold: true, underline: true }), span(6, 7, { bold: true, underline: true, black: true }), span(7, 8, { bold: true, underline: true }), span(8, 10, { underline: true })]);
  assert.equal(hasFormat(formats, 2, 8, 'bold'), true);
  assert.equal(hasFormat(formats, 2, 9, 'bold'), false);
  formats = toggleFormat(formats, 2, 8, 'bold');
  assert.equal(hasFormat(formats, 2, 8, 'bold'), false);
  assert.equal(hasFormat(formats, 5, 10, 'underline'), true);
  formats = toggleFormat(formats, 6, 7, null);
  assert.deepEqual(formats, [span(5, 6, { underline: true }), span(7, 10, { underline: true })]);
});

test('空选区不改变格式，跨越未设置的文字会统一启用格式', () => {
  const formats = [span(1, 3, { bold: true }), span(5, 7, { bold: true })];
  assert.deepEqual(toggleFormat(formats, 4, 4, 'bold'), formats);
  assert.deepEqual(toggleFormat(formats, 1, 7, 'bold'), [span(1, 7, { bold: true })]);
});

test('插入、删除和替换时格式随原文字移动，整段删除后不留无效选区', () => {
  const formats = [span(2, 4, { bold: true })];
  assert.deepEqual(editFormats('甲乙目标丙', '新甲乙目标丙', formats), [span(3, 5, { bold: true })]);
  assert.deepEqual(editFormats('甲乙目标丙', '甲乙目新增标丙', formats), [span(2, 6, { bold: true })]);
  assert.deepEqual(editFormats('甲乙目标丙', '甲乙替换丙', formats), [span(2, 4, { bold: true })]);
  assert.deepEqual(editFormats('甲乙目标丙', '甲乙丙', formats), []);
});

test('去掉列表符号、空行和前后空格时格式仍准确对应原文', () => {
  const resume = createSample();
  const item = resume.sections[0].items[0];
  item.description = '  - 负责开发  \r\n\r\n  1. 提升 25%  \n';
  const start = item.description.indexOf('提升');
  item.descriptionFormat = [span(start, start + 6, { bold: true, underline: true })];
  const cleaned = cleanResume(resume).sections[0].items[0];
  assert.equal(cleaned.description, '负责开发\n提升 25%');
  assert.deepEqual(cleaned.descriptionFormat, [span(5, 11, { bold: true, underline: true })]);
  assert.deepEqual(descriptionLines(item.description), ['负责开发', '提升 25%']);
  const line = descriptionSegments(item.description)[1];
  assert.deepEqual(sliceFormats(item.descriptionFormat, line.start, line.end), [span(0, 6, { bold: true, underline: true })]);
});

test('旧简历兼容，新格式可经 JSON 校验恢复；越界或重叠选区被拒绝', () => {
  const resume = createSample();
  assert.equal(resumeSchema.safeParse(resume).success, true);
  const item = resume.sections[0].items[0];
  item.description = '负责开发，效率提升25%。';
  item.descriptionFormat = [span(5, 11, { bold: true, black: true, underline: true })];
  assert.deepEqual(resumeSchema.parse(JSON.parse(JSON.stringify(resume))).sections[0].items[0].descriptionFormat, item.descriptionFormat);
  item.descriptionFormat = [span(0, 100, { bold: true })];
  assert.equal(resumeSchema.safeParse(resume).success, false);
  item.descriptionFormat = [span(0, 5, { bold: true }), span(4, 6, { underline: true })];
  assert.equal(resumeSchema.safeParse(resume).success, false);
});

test('含表情的长段落按片段换页时文字和跨页格式完整保留', () => {
  const text = '第一段😀这是需要强调的内容，第二段结束。';
  const start = text.indexOf('需要'), end = text.indexOf('，');
  const formats = [span(start, end, { bold: true, underline: true })];
  const split = text.indexOf('强调');
  const parts = [{ text: text.slice(0, split), formats: sliceFormats(formats, 0, split) }, { text: text.slice(split), formats: sliceFormats(formats, split, text.length) }];
  assert.equal(parts.flatMap(part => formattedRuns(part.text, part.formats)).map(run => run.text).join(''), text);
  assert.equal(parts.flatMap(part => formattedRuns(part.text, part.formats)).filter(run => run.bold).map(run => run.text).join(''), '需要强调的内容');
});

test('Markdown 导出保留局部加粗、黑色和下划线，正文不被当作 HTML', () => {
  const resume = createSample();
  const item = resume.sections[0].items[0];
  item.description = '结果 <目标> 达成';
  item.descriptionFormat = [span(3, 7, { bold: true, black: true, underline: true })];
  assert.match(toMarkdown(resume), /<span style="color:#000"><u>\*\*&lt;目标&gt;\*\*<\/u><\/span>/);
  assert.equal(formattedRuns(item.description, item.descriptionFormat).map(run => run.text).join(''), item.description);
});

test('重复文字按真实输入位置移动格式，前删和后删均保留正确选区', () => {
  const formats = [span(2, 4, { bold: true })];
  assert.deepEqual(editFormats('哈哈哈哈哈', '哈哈哈哈哈哈', formats, { start: 0, end: 0, inputType: 'insertText' }), [span(3, 5, { bold: true })]);
  assert.deepEqual(editFormats('哈哈哈哈哈', '哈哈哈哈', formats, { start: 1, end: 1, inputType: 'deleteContentBackward' }), [span(1, 3, { bold: true })]);
  assert.deepEqual(editFormats('哈哈哈哈哈', '哈哈哈哈', formats, { start: 0, end: 0, inputType: 'deleteContentForward' }), [span(1, 3, { bold: true })]);
});


test('个人简介格式可保存恢复、导出，整理空白后仍对应原文', () => {
  const resume = createSample();
  resume.profile.summary = '  第一行  \n\n\n  擅长  数据分析  \n';
  const start = resume.profile.summary.indexOf('数据分析');
  resume.profile.summaryFormat = [span(start, start + 4, { bold: true, black: true, underline: true })];
  assert.deepEqual(resumeSchema.parse(JSON.parse(JSON.stringify(resume))).profile.summaryFormat, resume.profile.summaryFormat);
  const cleaned = cleanResume(resume);
  assert.equal(cleaned.profile.summary, '第一行\n\n擅长 数据分析');
  assert.deepEqual(cleaned.profile.summaryFormat, [span(8, 12, { bold: true, black: true, underline: true })]);
  assert.equal(resumeSchema.safeParse(cleaned).success, true);
  assert.match(toMarkdown(cleaned), /<span style="color:#000"><u>\*\*数据分析\*\*<\/u><\/span>/);
  resume.profile.summaryFormat = [span(0, 100, { bold: true })];
  assert.equal(resumeSchema.safeParse(resume).success, false);
});

test('普通段落保留原文编号与格式，要点开关在 JSON 和导出中保留', () => {
  const resume = createSample();
  const item = resume.sections[0].items[0];
  item.description = '1. 项目成果\n第二段说明';
  item.descriptionFormat = [span(3, 7, { bold: true, underline: true })];
  item.descriptionBullets = false;
  item.projects = [{ id: crypto.randomUUID(), name: '测试项目', description: '项目第一段\n项目第二段', descriptionBullets: false }];
  const restored = resumeSchema.parse(JSON.parse(JSON.stringify(resume)));
  assert.equal(restored.sections[0].items[0].descriptionBullets, false);
  assert.equal(restored.sections[0].items[0].projects[0].descriptionBullets, false);
  const cleaned = cleanResume(restored).sections[0].items[0];
  assert.equal(cleaned.description, item.description);
  assert.deepEqual(cleaned.descriptionFormat, item.descriptionFormat);
  assert.equal(descriptionSegments(item.description, false)[0].text, '1. 项目成果');
  assert.equal(descriptionSegments(item.description, true)[0].text, '项目成果');
  const markdown = toMarkdown(restored);
  assert.ok(markdown.includes('1. <u>**项目成果**</u>\n\n第二段说明'));
  assert.ok(markdown.includes('项目第一段\n\n项目第二段'));
  item.descriptionBullets = true;
  assert.ok(toMarkdown(resume).includes('- <u>**项目成果**</u>'));
});

test('逐段混排在插入、删除、拆分及整理空行后保持对应关系', async () => {
  const { editLineBullets } = await import('../src/lib/format.ts');
  const before = '甲段\n乙段\n丙段';
  const modes = [false, true, false];
  assert.deepEqual(editLineBullets(before, '新段\n' + before, modes, true, {start:0,end:0,inputType:'insertText'}), [false,false,true,false]);
  assert.deepEqual(editLineBullets(before, '甲段\n丙段', modes, true, {start:3,end:6,inputType:'deleteContentForward'}), [false,false]);
  assert.deepEqual(editLineBullets(before, '甲\n段\n乙段\n丙段', modes, true, {start:1,end:1,inputType:'insertLineBreak'}), [false,false,true,false]);
  assert.deepEqual(editLineBullets('哈哈\n哈哈\n哈哈', '新\n哈哈\n哈哈\n哈哈', modes, true, {start:0,end:0,inputType:'insertText'}), [false,false,true,false]);
  const resume = createSample(); const item = resume.sections[0].items[0];
  item.description = '普通说明\n\n- 工作成果\n结束说明'; item.descriptionLineBullets = [false,false,true,false];
  item.descriptionFormat = [span(8,12,{bold:true,underline:true})];
  const cleaned = cleanResume(resume);
  assert.deepEqual(cleaned.sections[0].items[0].descriptionLineBullets,[false,true,false]);
  assert.deepEqual(resumeSchema.parse(JSON.parse(JSON.stringify(cleaned))).sections[0].items[0].descriptionLineBullets,[false,true,false]);
  const md = toMarkdown(resume); assert.ok(md.includes('普通说明\n\n- <u>**工作成果**</u>\n结束说明'));
});
