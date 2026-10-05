import type { TigerCodeRoot } from "./datasets";

/** 字根模式：全字根 / 归并字根 */
export type TigerRootMode = "all" | "merged";

/** 练习模式：学习 / 普通 / 复习 / 跟打 / 错题 */
export type TigerPracticeMode = "learning" | "normal" | "review" | "follow" | "wrong";

/** 界面显示级别：不隐 / 半隐 / 全隐 */
export type TigerUiMode = "show" | "half" | "full";

/** 明暗主题 */
export type TigerSchemeMode = "light" | "dark";

/** 配色方案，`auto` 表示按进度自动轮换 */
export type TigerPaletteMode =
  | "auto"
  | "one"
  | "solarized"
  | "nord"
  | "catppuccin"
  | "gruvbox"
  | "tokyonight"
  | "rosepine";

/** 单个根的复习阶段 */
export interface TigerReviewStage {
  /** 已完成的间隔步数下标 */
  stage: number;
}

/** 复习队列条目 */
export interface TigerReviewQueueEntry {
  /** 当前根在激活数据集中的下标 */
  idx: number;
  /** 到期的全局轮次 */
  dueAt: number;
}

/** 单个练习模式的答题统计 */
export interface TigerPracticeStats {
  total: number;
  correct: number;
}

/**
 * 序列化后的完整练习状态。
 * 字段沿用 legacy 的缩写形式，以减小云端传输体积；不可随意改名，否则旧设备数据无法恢复。
 */
export interface TigerCodeSnapshot {
  /** 已掌握的根下标集合 */
  cs: number[];
  /** 错题集：全字根 / 归并字根 */
  wb: { a: number[]; m: number[] };
  /** 错题纠正进度 */
  wp: { a: number[]; m: number[] };
  /** 间隔复习阶段，键为根下标 */
  rs: Record<string, TigerReviewStage>;
  /** 待复习队列 */
  rq: TigerReviewQueueEntry[];
  /** 全局轮次 */
  t: number;
  /** 各练习模式答题统计 */
  st: Record<string, [number, number]>;
  /** 各字根模式完成轮数（皇冠） */
  rm: { a: number; m: number };
  /** 学习模式已见根 */
  ls: { a: number[]; m: number[] };
  /** 当前字根模式 */
  md: TigerRootMode;
  /** 当前练习模式 */
  pm: TigerPracticeMode;
  /** 缩放档位 */
  si: number;
  /** 明暗主题 */
  sm: TigerSchemeMode;
  /** 配色模式 */
  pl: TigerPaletteMode;
  /** auto 配色基准下标 */
  ap: number;
  /** 时间戳（毫秒） */
  ts: number;
  /**
   * legacy 早期快照的全局总题次。
   *
   * 旧版本把统计存成扁平的 `to` / `c` 两个字段，而非现在的 `st`。
   * `restore()` 在 `st` 缺失时会回退读取这两个字段，保证旧进度不丢。
   */
  to?: number;
  /** legacy 早期快照的全局答对次数，见 {@link TigerCodeSnapshot.to} */
  c?: number;
}

/** 两个数据集按字根模式组合后的视图 */
export interface TigerRootViews {
  all: TigerCodeRoot[];
  merged: TigerCodeRoot[];
}
