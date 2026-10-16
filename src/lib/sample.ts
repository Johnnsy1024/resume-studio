import { createBlank, newItem } from '../schema.ts';
import type { ResumeItem } from '../schema.ts';

const item = (content: Partial<ResumeItem>) => ({ ...newItem(), ...content });

export function createSample() {
  const resume = createBlank();
  resume.title = '产品经理 · 中文简历';
  resume.profile = {
    name: '林知远', headline: '产品经理', email: 'lin.zhiyuan@example.com', phone: '138 0000 0000',
    city: '上海', years: '5 年', website: '',
    summary: '具备 5 年互联网产品经验，擅长从用户需求出发推动产品从 0 到 1 落地，并在数据和商业目标上取得实际成果。\n喜欢在复杂问题中寻找简单方案，关注长期价值与用户体验。',
  };
  resume.sections[0].items = [
    item({ title: '山海科技', subtitle: '高级产品经理', start: '2021.03', end: '至今',
      description: '负责公司核心产品的整体规划与迭代，带领团队完成多项重要功能上线，产品月活跃用户从 50 万增长至 300 万。\n深入用户调研与数据分析，识别关键问题并推动产品优化，提升用户留存率 20% 以上。\n跨部门协作，协调研发、设计与运营资源，确保项目高质量按期交付。' }),
    item({ title: '云启互联网', subtitle: '产品经理', start: '2019.07', end: '2021.02',
      description: '负责移动端产品的需求分析、产品设计与版本迭代，主导完成 3 个核心功能模块上线。\n基于用户反馈持续优化产品体验，提升产品评分从 3.8 至 4.6。\n跟踪行业动态与竞品分析，输出产品策略建议，支持业务快速发展。' }),
  ];
  resume.sections[1].items = [item({ title: '知学 Pro · 在线学习平台', subtitle: '核心负责人', start: '2020.03', end: '2021.01',
    description: '从 0 到 1 搭建在线学习平台，完成产品规划、需求梳理和版本上线。\n上线后 6 个月内注册用户突破 100 万，付费转化率提升 3 倍。\n带领 6 人跨职能团队，协调研发、设计、运营资源，确保项目顺利落地。' })];
  resume.sections[2].items = [item({ title: '复旦大学', subtitle: '计算机科学与技术 · 本科', start: '2015.09', end: '2019.06' })];
  resume.sections[3].items = [
    item({ title: '产品能力', description: '需求分析、产品规划、数据分析、项目管理' }),
    item({ title: '工具', description: 'Axure、Figma、SQL、Excel、Notion、Jira' }),
    item({ title: '语言', description: '中文（母语）、英文（良好）' }),
  ];
  return resume;
}
