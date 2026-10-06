import { tigerCodeRoots, tigerCodeRootsMerged } from "./datasets";
import type { TigerCodeRoot, TigerRootViews } from "./types";

/**
 * 规范化字根标签：把半角括号统一为全角。
 *
 * 数据源中 `囗(框)` 使用半角括号，而界面展示需要全角 `囗（框）`。
 */
export const normalizeRootLabel = (label: string): string => label.replace(/囗\(框\)/g, "囗（框）");

/** 规范化单条字根记录 */
export const normalizeRootItem = (item: TigerCodeRoot): TigerCodeRoot => ({
  root: normalizeRootLabel(item.root),
  code: item.code,
});

/** 去除空白后用于匹配（归并数据里同一组的多个变体以空格分隔） */
export const normalizeMatch = (value: string): string => value.replace(/\s+/g, "");

/** 变体 ↔ 归并 的双向索引映射 */
export interface TigerRootMapping {
  /** `mergedToVariants[i]`：第 i 个归并根对应的所有变体下标 */
  mergedToVariants: number[][];
  /** `variantToMerged[i]`：第 i 个变体根对应的归并根下标，未匹配为 -1 */
  variantToMerged: number[];
}

/**
 * 构建变体根与归并根的双向映射。
 *
 * 匹配规则：先按两码 `code` 分组，再判断变体根的字形是否被归并根的字符串包含。
 * 归并根的 `root` 形如 `"火  灬"`，去掉空白后即可用 `includes` 判定某个变体是否属于该组。
 */
export const buildRootMapping = (views: TigerRootViews): TigerRootMapping => {
  const mergedToVariants: number[][] = Array.from({ length: views.merged.length }, () => []);
  const variantToMerged: number[] = Array(views.all.length).fill(-1);

  const mergedByCode = new Map<string, { idx: number; root: string }[]>();
  views.merged.forEach((item, idx) => {
    const list = mergedByCode.get(item.code) ?? [];
    list.push({ idx, root: normalizeMatch(item.root) });
    mergedByCode.set(item.code, list);
  });

  views.all.forEach((item, vIdx) => {
    const list = mergedByCode.get(item.code);
    if (!list) return;
    const vRoot = normalizeMatch(item.root);
    const match = list.find(entry => entry.root.includes(vRoot));
    if (!match) return;
    variantToMerged[vIdx] = match.idx;
    mergedToVariants[match.idx].push(vIdx);
  });

  return { mergedToVariants, variantToMerged };
};

/** 变体根完成状态 → 归并根完成状态（组内任一变体完成即视为该组完成） */
export const mapCompletedToMerged = (completedVariants: Iterable<number>, mapping: TigerRootMapping): Set<number> => {
  const mergedSet = new Set<number>();
  for (const vIdx of completedVariants) {
    const mergedIdx = mapping.variantToMerged[vIdx];
    if (mergedIdx >= 0) mergedSet.add(mergedIdx);
  }
  return mergedSet;
};

/** 归并根完成状态 → 变体根完成状态（该组所有变体一并展开为完成） */
export const mapCompletedToVariants = (completedMerged: Iterable<number>, mapping: TigerRootMapping): Set<number> => {
  const variantSet = new Set<number>();
  for (const mIdx of completedMerged) {
    const list = mapping.mergedToVariants[mIdx] ?? [];
    for (const vIdx of list) variantSet.add(vIdx);
  }
  return variantSet;
};

/**
 * 规范化两个数据集并建立映射。
 * 组件初始化时调用一次即可，结果不再变化。
 */
export const createRootViews = (): { views: TigerRootViews; mapping: TigerRootMapping } => {
  const views: TigerRootViews = {
    all: tigerCodeRoots.map(normalizeRootItem),
    merged: tigerCodeRootsMerged.map(normalizeRootItem),
  };
  return { views, mapping: buildRootMapping(views) };
};

/**
 * 重建练习顺序：已完成项在前（保持升序），未完成项随机打乱在后。
 */
export const buildOrderWithCompleted = (
  totalItems: number,
  completed: Set<number>,
  shuffle: (a: number[]) => number[]
) => {
  const done: number[] = [];
  for (const idx of completed) {
    if (idx >= 0 && idx < totalItems) done.push(idx);
  }
  done.sort((a, b) => a - b);

  const rest: number[] = [];
  for (let i = 0; i < totalItems; i += 1) {
    if (!completed.has(i)) rest.push(i);
  }
  shuffle(rest);

  return { order: done.concat(rest), resumeAt: done.length };
};
