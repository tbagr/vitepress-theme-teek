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

/** 全部字根模式 */
export const TIGER_ROOT_MODES = ["all", "merged"] as const;

/** 全部练习模式 */
export const TIGER_PRACTICE_MODES = ["learning", "normal", "review", "follow", "wrong"] as const;

/**
 * 类型组合键：2 种字根模式 × 5 种练习模式 = 10 种。
 *
 * 每种组合各自持有独立的进度、统计、错题与皇冠，切换任意一种都不影响其余九种。
 */
export type TigerTypeKey = `${TigerRootMode}:${TigerPracticeMode}`;

/** 拼装类型组合键 */
export const tigerTypeKey = (rootMode: TigerRootMode, practiceMode: TigerPracticeMode): TigerTypeKey =>
  `${rootMode}:${practiceMode}`;

/** 全部 10 种类型组合键 */
export const TIGER_TYPE_KEYS: TigerTypeKey[] = TIGER_ROOT_MODES.flatMap(rootMode =>
  TIGER_PRACTICE_MODES.map(practiceMode => tigerTypeKey(rootMode, practiceMode))
);

/**
 * 单个类型组合的练习状态。
 *
 * 这里**不含**错题集：错题是跨练习模式共享的（见 {@link TigerRootMode} 分桶），
 * 否则在「普通」模式打错的字根永远不会出现在「错题」模式里，等于打错白打。
 */
export interface TigerTypeBucket {
  /** 已掌握的根下标 */
  completed: Set<number>;
  /** 答题总次数 */
  total: number;
  /** 答对次数 */
  correct: number;
  /** 已完成轮数（皇冠） */
  rounds: number;
}

/** 10 种类型组合的状态容器 */
export type TigerTypeBuckets = Record<TigerTypeKey, TigerTypeBucket>;

/**
 * v2 快照中按类型组合分桶的部分。
 *
 * `rs` / `rq`（复习相关）按字根模式分桶即可；`cs` / `st` / `rm` 以
 * {@link TigerTypeKey} 为键，覆盖全部 10 种组合。错题集 `wb` / `wp`
 * 同样按字根模式分桶，故留在快照顶层而非此处。
 */
export interface TigerSnapshotBuckets {
  /** 已掌握根下标，键为类型组合键 */
  cs: Record<string, number[]>;
  /** 答题统计，键为类型组合键 */
  st: Record<string, [number, number]>;
  /** 完成轮数（皇冠），键为类型组合键 */
  rm: Record<string, number>;
  /**
   * 间隔复习阶段，键为根下标。
   *
   * 根下标只在所属字根模式的数据集内有意义，因此按字根模式分桶；
   * 同一字根模式下的 5 种练习模式共享一份复习队列，否则在其他模式答对的题
   * 永远不会出现在「复习」模式的队列里。
   */
  rs: { a: Record<string, TigerReviewStage>; m: Record<string, TigerReviewStage> };
  /** 待复习队列，按字根模式分桶 */
  rq: { a: TigerReviewQueueEntry[]; m: TigerReviewQueueEntry[] };
}

/**
 * 序列化后的完整练习状态。
 * 字段沿用 legacy 的缩写形式，以减小云端传输体积；不可随意改名，否则旧设备数据无法恢复。
 */
export interface TigerCodeSnapshot {
  /**
   * v2 快照：10 种类型组合的独立状态。
   *
   * 嵌套在 `b` 下而非复用顶层 `cs` / `st` / `wb` / `wp` / `rm`，是为了让旧设备数据
   * （顶层扁平字段）能够被无歧义地识别并迁移。存在 `b` 即为 v2。
   */
  b?: TigerSnapshotBuckets;
  /** 已掌握的根下标集合（legacy v1 全字根进度，v2 快照不再写出） */
  cs?: number[];
  /**
   * 错题集：全字根 / 归并字根。
   *
   * v1 与 v2 共用这一形状：错题按字根模式分桶、由同字根下的 5 种练习模式共享，
   * 不随 10 桶重构而改变，因此不必在 `b` 里另存一份。
   */
  wb?: { a: number[]; m: number[] };
  /** 错题纠正进度，形状同 `wb` */
  wp?: { a: number[]; m: number[] };
  /** 间隔复习阶段，键为根下标（legacy v1，v2 见 `b.rs`） */
  rs?: Record<string, TigerReviewStage>;
  /** 待复习队列（legacy v1，v2 见 `b.rq`） */
  rq?: TigerReviewQueueEntry[];
  /** 全局轮次 */
  t: number;
  /** 各练习模式答题统计（legacy v1，v2 见 `b.st`） */
  st?: Record<string, [number, number]>;
  /** 各字根模式完成轮数（legacy v1，v2 见 `b.rm`） */
  rm?: { a: number; m: number };
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
