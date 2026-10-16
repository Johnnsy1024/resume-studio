export type Measured<T> = T & { height: number; keepNext?: boolean };

// 标题与第一条内容一起换页；超长正文由调用方按实际字体拆开。
export function paginate<T extends { height: number; keepNext?: boolean }>(
  blocks: T[], capacity: number,
  split: (block: T, space: number) => [T, T] | null,
): T[][] {
  const pages: T[][] = [[]];
  let used = 0;
  const nextPage = () => { if (pages[pages.length - 1].length) { pages.push([]); used = 0; } };
  const append = (block: T) => { pages[pages.length - 1].push(block); used += block.height; };
  for (let index = 0; index < blocks.length;) {
    const group: T[] = [blocks[index++]];
    while (group[group.length - 1].keepNext && index < blocks.length) group.push(blocks[index++]);
    const groupHeight = group.reduce((sum, block) => sum + block.height, 0);
    if (groupHeight <= capacity && used + groupHeight > capacity) nextPage();
    if (groupHeight > capacity && capacity - used < Math.min(groupHeight, 120)) nextPage();
    for (let block of group) {
      while (used + block.height > capacity + 0.1) {
        const space = capacity - used;
        const parts = space > 30 ? split(block, space) : null;
        if (parts) {
          append(parts[0]);
          nextPage();
          block = parts[1];
        } else if (used > 0) nextPage();
        else {
          // 不支持拆分的块保留全部内容，让导出前的溢出检查明确报错。
          break;
        }
      }
      append(block);
    }
  }
  return pages;
}
