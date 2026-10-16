import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { recognizeResume, extractDateRange, identifyHeading } from '../src/lib/importResume.ts';
import { orderedPageText } from '../server/import-layout.mjs';
import { extractWord } from '../server/import-word.mjs';

test('日期支持中文、紧连年月、英文月份和只有年份的范围', () => {
  for (const [value, start, end] of [
    ['2021年3月—2024年6月', '2021.03', '2024.06'], ['2021.03-2024.06', '2021.03', '2024.06'],
    ['Jan 2021 – Present', 'Jan 2021', 'Present'], ['2014 – 2018', '2014', '2018'],
  ]) {
    const result = extractDateRange(value);
    assert.equal(result?.start, start); assert.equal(result?.end, end); assert.equal(result?.remaining, '');
  }
  assert.equal(extractDateRange('提升 25%'), null);
  assert.equal(identifyHeading('01 工 作 经 历'), 'experience');
});
test('识别带标签的联系方式和多条经历，将日期归入对应条目', () => {
  const { resume } = recognizeResume('个人简历\n姓名：王亦辰\n求职意向：高级后端工程师\n城市：杭州 | 手机：139 1234 5678 | 邮箱：yichen@example.com\n工作经验：6年\n工作经历\n北辰科技 高级后端工程师\t2022.03 – 至今\n负责服务开发，延迟降低 25%。\n星河互联网 后端工程师\t2019.07 – 2022.02\n完成 3 个模块。\n教育背景\n浙江大学\n2015.09 – 2019.06\n计算机专业 · 本科');
  assert.equal(resume.profile.name, '王亦辰');
  assert.equal(resume.profile.city, '杭州');
  assert.equal(resume.profile.email, 'yichen@example.com');
  assert.equal(resume.profile.phone, '139 1234 5678');
  assert.equal(resume.profile.years, '6年');
  assert.equal(resume.sections[0].items.length, 2);
  assert.deepEqual(resume.sections[0].items.map(item => [item.title, item.subtitle, item.start, item.end]), [['北辰科技', '高级后端工程师', '2022.03', '至今'], ['星河互联网', '后端工程师', '2019.07', '2022.02']]);
  assert.equal(resume.sections[1].items[0].start, '2015.09');
});
test('英文职责不被下一条经历的日期误分，技能分类不被当成新模块', () => {
  const { resume } = recognizeResume('Alex Morgan\nSenior Software Engineer\nLocation: London | Phone: +44 20 7946 0958 | Email: alex@example.com\nWork Experience\nNorthstar Labs | Senior Engineer | Jan 2021 – Present\nReduced latency by 35% while serving 2 million requests per day.\nRiverstone Ltd. | Software Engineer | Jul 2018 – Dec 2020\nBuilt three data services.\nTechnical Skills\nLanguages: Python, Java\nTools: Git, Docker');
  assert.equal(resume.language, 'en');
  assert.equal(resume.profile.name, 'Alex Morgan');
  assert.equal(resume.profile.city, 'London');
  assert.equal(resume.sections[0].items.length, 2);
  assert.match(resume.sections[0].items[0].description, /Reduced latency by 35%/);
  assert.equal(resume.sections[0].items[1].title, 'Riverstone Ltd.');
  assert.equal(resume.sections[1].kind, 'skills');
  assert.equal(resume.sections[1].items[0].title, 'Languages');
});
test('未知内容及超长行保留原文，不擅自编写姓名或删除数字', () => {
  const paragraph = '这是一段没有标准标题的详细经历，包含实际情况和需要保留的内容。'.repeat(600);
  const { resume, warnings } = recognizeResume(paragraph, '旧版简历.pdf');
  assert.equal(resume.profile.name, '');
  assert.ok(warnings.length > 0);
  assert.equal(resume.sections.flatMap(section => section.items).map(item => item.description).join(''), paragraph.normalize('NFKC'));
  const other = recognizeResume('王 亦 辰\n工程师\n工作经历\n示例公司\n-10%\n3.8 分').resume;
  assert.equal(other.profile.name, '王亦辰');
  assert.match(other.sections[0].items[0].description, /-10%\n3.8 分/);
});
test('空内容和超过长度限制的原文明确报错', () => {
  assert.throws(() => recognizeResume(''), /没有识别到/);
  assert.throws(() => recognizeResume('字'.repeat(60001)), /6 万字/);
});
test('PDF 文字按位置拼行，两栏分别读取', () => {
  const items = [];
  for (let index = 0; index < 10; index++) {
    items.push({ text: `左栏内容${index}`, x: 30, y: index * 30, width: 100, height: 12 });
    items.push({ text: `右栏内容${index}`, x: 250, y: index * 30, width: 200, height: 12 });
  }
  const text = orderedPageText(items.reverse(), 600);
  assert.equal(text.split('\n').length, 20);
  assert.ok(text.indexOf('左栏内容9') < text.indexOf('右栏内容0'));
  const row = orderedPageText([{ text: '公司', x: 30, y: 0, width: 24, height: 12 }, { text: '2021 – 2024', x: 350, y: 0, width: 100, height: 12 }], 600);
  assert.equal(row, '公司\t2021 – 2024');
});
test('字体将段落拆成多个字形片段时仍按单栏阅读', () => {
  const items = [];
  for (let row = 0; row < 10; row++) for (let glyph = 0; glyph < 38; glyph++) {
    items.push({ text: '字', x: 30 + glyph * 12, y: row * 26, width: 12, height: 12 });
  }
  const text = orderedPageText(items, 600);
  assert.deepEqual(text.split('\n'), Array(10).fill('字'.repeat(38)));
});
test('DOCX 的正文、表格和文本框均保留，外部关系不被读取', async () => {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>姓名：王亦辰</w:t></w:r></w:p><w:p><w:r><w:t>工作经历</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>北辰科技</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2021.01 – 至今</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>负责服务开发。</w:t></w:r><w:r><w:txbxContent><w:p><w:r><w:t>文本框中需要保留的文字</w:t></w:r></w:p></w:txbxContent></w:r></w:p></w:body></w:document>';
  const zip = zipSync({ 'word/document.xml': strToU8(xml), 'word/_rels/document.xml.rels': strToU8('<Relationships><Relationship Target="file:///etc/passwd" TargetMode="External"/></Relationships>') });
  const result = await extractWord(Buffer.from(zip), '.docx');
  assert.match(result.text, /北辰科技\t2021.01 – 至今/);
  assert.equal(result.text.split('文本框中需要保留的文字').length - 1, 1);
  assert.equal(result.text.includes('file:///'), false);
});
test('拒绝损坏或解压体积过大的 DOCX', async () => {
  await assert.rejects(extractWord(Buffer.from('broken'), '.docx'), /无法读取 Word/);
  const zip = Buffer.from(zipSync({ 'word/document.xml': strToU8('<document/>') }));
  const offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(60 * 1024 * 1024, offset + 24);
  await assert.rejects(extractWord(zip, '.docx'), /解压后过大/);
});
