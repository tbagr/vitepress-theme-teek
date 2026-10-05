import { computed, onBeforeUnmount, ref } from "vue";
import { wubi08DatasetMap, wubi08Datasets } from "./datasets";

/** 单个字符的判定结果 */
export type CellState = "pending" | "correct" | "error";

export interface TypingCell {
  /** 目标字符（可能是换行符，用于保留原文换行） */
  char: string;
  /** 该位置是否已输入正确 */
  state: CellState;
}

export interface TypingStats {
  /** 目标总字数，不计换行符 */
  total: number;
  /** 已键入字数，不计换行符 */
  typed: number;
  /** 错误字符数 */
  errors: number;
  /** 正确率百分比 */
  rate: number;
  /** 速度，字/分 */
  speed: number;
  /** 已用秒数 */
  elapsed: number;
  /** 是否已练完 */
  finished: boolean;
}

/**
 * 把 CRLF / CR 统一成 LF。
 *
 * 数据集原文混用 `\r\n` 与 `\n`，而 textarea 里用户按下回车只会产生 `\n`，
 * 两边不归一就会在每个换行处产生一个字符的错位。
 */
const normalizeNewlines = (value: string): string => value.replace(/\r\n?/g, "\n");

/** 按码点切分，避免代理对被拆成两个字符 */
const toChars = (value: string): string[] => Array.from(value);

/** 统计字数时忽略换行符 */
const countChars = (chars: string[]): number => chars.reduce((sum, char) => (char === "\n" ? sum : sum + 1), 0);

/**
 * 五笔打字练习的会话状态。
 *
 * 旧实现靠 `setInterval` + 手写 DOM 逐字定位（`charWidth = code > 255 ? 24 : 13`、
 * `top += 60`、`left > 974 - charWidth`）来给字符上色，这些常量全部绑死在
 * `font: Consolas 24px` + `line-height: 60px` + `width: 40.49em` 上，无法响应式。
 * 这里只产出「每个位置的状态」，排版完全交给 CSS 流的两个同度量图层叠加完成。
 */
export const useTypingTrainer = () => {
  const activeKey = ref(wubi08Datasets[0]!.key);
  const typed = ref("");
  const elapsed = ref(0);
  const running = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;

  const target = computed(() => normalizeNewlines(wubi08DatasetMap[activeKey.value]?.text ?? ""));
  const targetChars = computed(() => toChars(target.value));
  const typedChars = computed(() => toChars(typed.value));

  /** 目标总长度（含换行符），输入层据此截断超长输入 */
  const targetLength = computed(() => targetChars.value.length);

  /** 逐位置比对：已输入且相等为 correct，不等为 error，未输入为 pending */
  const cells = computed<TypingCell[]>(() => {
    const input = typedChars.value;
    const length = Math.min(input.length, targetChars.value.length);
    const result: TypingCell[] = new Array(targetChars.value.length);

    for (let i = 0; i < targetChars.value.length; i++) {
      const char = targetChars.value[i]!;
      const state: CellState = i >= length ? "pending" : input[i] === char ? "correct" : "error";
      result[i] = { char, state };
    }

    return result;
  });

  const stats = computed<TypingStats>(() => {
    const total = countChars(targetChars.value);
    const typedCount = countChars(typedChars.value);
    const errors = cells.value.reduce((sum, cell) => (cell.state === "error" ? sum + 1 : sum), 0);

    return {
      total,
      typed: typedCount,
      errors,
      rate: typedCount ? Math.round(100 - (errors / typedCount) * 100) : 0,
      speed: elapsed.value ? Math.round((typedCount / elapsed.value) * 60) : 0,
      elapsed: elapsed.value,
      finished: targetChars.value.length > 0 && typedChars.value.length >= targetChars.value.length,
    };
  });

  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    running.value = false;
  };

  const startTimer = () => {
    if (timer !== null) return;
    running.value = true;
    timer = setInterval(() => (elapsed.value += 1), 1000);
  };

  /** F8 暂停 / 继续 */
  const toggleTimer = () => (timer === null ? startTimer() : stopTimer());

  /** 切换练习内容：清空输入与计时 */
  const selectDataset = (key: string) => {
    activeKey.value = key;
    typed.value = "";
    stopTimer();
    elapsed.value = 0;
  };

  const reset = () => {
    typed.value = "";
    stopTimer();
    elapsed.value = 0;
  };

  /**
   * 输入变化。
   *
   * 旧实现挂在 `keyup` 上，会漏掉粘贴、鼠标选中删除与移动端软键盘的删除，
   * 且在输入法组合过程中（拼音还没上屏）就会结算，把候选拼音算成错字。
   * 这里改用 `input` 事件，并用 `isComposing` 过滤组合态。
   */
  const handleInput = (value: string, isComposing = false) => {
    typed.value = value;

    if (!value) {
      stopTimer();
      elapsed.value = 0;
      return;
    }

    if (isComposing) return;
    if (stats.value.finished) stopTimer();
    else startTimer();
  };

  onBeforeUnmount(stopTimer);

  return {
    activeKey,
    typed,
    running,
    cells,
    stats,
    targetLength,
    selectDataset,
    reset,
    toggleTimer,
    handleInput,
  };
};
