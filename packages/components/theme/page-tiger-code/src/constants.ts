import type { TigerPaletteMode, TigerRootMode, TigerSchemeMode } from "./types";

/** 遗忘曲线间隔步长（单位：轮次 `turn`） */
export const REVIEW_STEPS = [2, 5, 10] as const;

/** 计时器空闲阈值：超过此时长无键盘输入则暂停计时（毫秒） */
export const TIMER_IDLE_MS = 5000;

/** 计时器刷新间隔（毫秒） */
export const TIMER_TICK_MS = 250;

/** 光标自动隐藏延迟（毫秒） */
export const CURSOR_HIDE_DELAY = 1500;

/** 答错时输入框抖动动画时长（毫秒），需与 SCSS 中 `shake` 动画时长一致 */
export const SHAKE_DURATION_MS = 260;

/** 云同步节流间隔（毫秒） */
export const SYNC_THROTTLE_MS = 60000;

/**
 * 云同步单次请求超时（毫秒）。
 *
 * 网络被 DNS 黑洞或防火墙丢包时 `fetch` 既不 resolve 也不 reject，
 * 状态会永远停在「拉取中…」。必须靠超时兜底把状态收敛回可见结果。
 */
export const SYNC_TIMEOUT_MS = 15000;

/** localStorage 中保存设备 ID 的键 */
export const SYNC_USER_ID_KEY = "tc_uid";

/** 手动可选取的配色方案 */
export const PALETTE_OPTIONS = ["one", "solarized", "nord", "catppuccin", "gruvbox", "tokyonight", "rosepine"] as const;

/** 7 档缩放预设 */
export const SIZE_PRESETS = [
  { rootMin: 18, rootVw: "2.6vw", rootMax: 34, box: 24, boxFont: 14, boxMobile: 20, boxMobileFont: 12 },
  { rootMin: 20, rootVw: "2.9vw", rootMax: 38, box: 27, boxFont: 15, boxMobile: 23, boxMobileFont: 13 },
  { rootMin: 22, rootVw: "3.2vw", rootMax: 40, box: 30, boxFont: 16, boxMobile: 26, boxMobileFont: 14 },
  { rootMin: 24, rootVw: "3.5vw", rootMax: 44, box: 34, boxFont: 18, boxMobile: 30, boxMobileFont: 16 },
  { rootMin: 26, rootVw: "3.8vw", rootMax: 48, box: 38, boxFont: 20, boxMobile: 34, boxMobileFont: 18 },
  { rootMin: 28, rootVw: "4.1vw", rootMax: 52, box: 42, boxFont: 22, boxMobile: 38, boxMobileFont: 20 },
  { rootMin: 30, rootVw: "4.4vw", rootMax: 56, box: 46, boxFont: 24, boxMobile: 42, boxMobileFont: 22 },
] as const;

/** 默认缩放档位（0-6） */
export const DEFAULT_SIZE_INDEX = 3;

/** 默认字根模式 */
export const DEFAULT_ROOT_MODE: TigerRootMode = "all";

/** 默认练习模式 */
export const DEFAULT_PRACTICE_MODE = "normal" as const;

/** 默认配色模式 */
export const DEFAULT_PALETTE_MODE: TigerPaletteMode = "auto";

/** auto 模式下初始激活配色 */
export const DEFAULT_ACTIVE_PALETTE = "one";

/** 默认明暗主题 */
export const DEFAULT_SCHEME_MODE: TigerSchemeMode = "light";

/** 各配色下 `auto` 轮换时每轮跨越的进度步长 */
export const AUTO_PALETTE_STEP = 100;

/**
 * `body` 类名在 Vue 中落到页面根节点上，此处集中维护映射关系。
 * legacy 版本通过 `document.body.classList` 切换，迁移后改为根节点 class 绑定。
 */
export const buildRootClassList = (options: {
  schemeMode: TigerSchemeMode;
  paletteMode: TigerPaletteMode;
  activePalette: string;
  uiMode: string;
  practiceMode: string;
  cursorHidden: boolean;
}): string[] => {
  const { schemeMode, paletteMode, activePalette, uiMode, practiceMode, cursorHidden } = options;

  return [
    "tk-tiger-code",
    schemeMode === "dark" ? "theme-dark" : "",
    paletteMode === "auto" ? `theme-${activePalette}` : `theme-${paletteMode}`,
    uiMode === "half" ? "ui-half" : "",
    uiMode === "full" ? "ui-full" : "",
    practiceMode === "wrong" ? "practice-wrong" : "",
    practiceMode === "learning" ? "learning-mode" : "",
    cursorHidden ? "cursor-hidden" : "",
  ].filter(Boolean);
};
