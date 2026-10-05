import { computed, onMounted, onUnmounted, ref, type Ref } from "vue";
import {
  AUTO_PALETTE_STEP,
  CURSOR_HIDE_DELAY,
  DEFAULT_ACTIVE_PALETTE,
  DEFAULT_PALETTE_MODE,
  DEFAULT_PRACTICE_MODE,
  DEFAULT_ROOT_MODE,
  DEFAULT_SCHEME_MODE,
  DEFAULT_SIZE_INDEX,
  PALETTE_OPTIONS,
  REVIEW_STEPS,
  SHAKE_DURATION_MS,
  SIZE_PRESETS,
  TIMER_IDLE_MS,
  TIMER_TICK_MS,
  buildRootClassList,
} from "./constants";
import { buildOrderWithCompleted, createRootViews, mapCompletedToMerged, mapCompletedToVariants } from "./root-mapping";
import type {
  TigerCodeSnapshot,
  TigerPracticeMode,
  TigerPracticeStats,
  TigerRootMode,
  TigerReviewStage,
  TigerUiMode,
  TigerSchemeMode,
  TigerPaletteMode,
} from "./types";

/** 三个练习模式共享的统计容器 */
const createStatsMap = (): Record<TigerPracticeMode, TigerPracticeStats> => ({
  learning: { total: 0, correct: 0 },
  normal: { total: 0, correct: 0 },
  review: { total: 0, correct: 0 },
  follow: { total: 0, correct: 0 },
  wrong: { total: 0, correct: 0 },
});

/** Fisher-Yates 洗牌 */
const shuffle = <T>(array: T[]): T[] => {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

/** 转小写、剔除非字母、截断为 2 个字符 */
const normalizeInput = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 2);

/** 毫秒 → MM:SS / H:MM:SS */
const formatTimer = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

/**
 * 虎码字根练习状态机。
 *
 * 由 legacy `docs/public/tiger-code-exercise/scripts/index.js` 移植而来，
 * 把原先的全局可变变量与 `document` 副作用收敛为响应式状态。
 *
 * @param refs 模板元素引用，用于聚焦输入框与重播抖动动画
 */
export const useTigerCodeTrainer = (refs: {
  codeInput: Ref<HTMLInputElement | null>;
  inputWrap: Ref<HTMLElement | null>;
}) => {
  const { views, mapping } = createRootViews();

  // ── 模式与设置 ────────────────────────────────────────────────
  const mode = ref<TigerRootMode>(DEFAULT_ROOT_MODE);
  const practiceMode = ref<TigerPracticeMode>(DEFAULT_PRACTICE_MODE);
  const uiMode = ref<TigerUiMode>("show");
  const schemeMode = ref<TigerSchemeMode>(DEFAULT_SCHEME_MODE);
  const paletteMode = ref<TigerPaletteMode>(DEFAULT_PALETTE_MODE);
  const activePalette = ref<string>(DEFAULT_ACTIVE_PALETTE);
  const autoPaletteBaseIndex = ref(0);
  const sizeIndex = ref(DEFAULT_SIZE_INDEX);

  /** 间隔重复开关：由练习模式派生，仅 normal / learning / wrong 开启 */
  const reviewEnabled = computed(
    () => practiceMode.value === "normal" || practiceMode.value === "learning" || practiceMode.value === "wrong"
  );

  // ── 练习状态 ──────────────────────────────────────────────────
  const order = ref<number[]>([]);
  const currentIndex = ref(0);
  const currentItemIndex = ref(0);
  const currentIsReview = ref(false);
  const locked = ref(false);
  const buffer = ref("");
  const reviewQueue = ref<{ idx: number; dueAt: number }[]>([]);
  const reviewState = ref(new Map<number, TigerReviewStage>());
  const completedSet = ref(new Set<number>());
  const wrongByMode = ref({ all: new Set<number>(), merged: new Set<number>() });
  const wrongProgressByMode = ref({ all: new Set<number>(), merged: new Set<number>() });
  const roundsByMode = ref({ all: 0, merged: 0 });
  const learningSeenByMode = ref({ all: new Set<number>(), merged: new Set<number>() });
  const statsByMode = ref(createStatsMap());
  const turn = ref(0);

  // ── 渲染状态 ──────────────────────────────────────────────────
  const revealCode = ref("");
  const revealVisible = ref(false);
  const isError = ref(false);
  const wrongDone = ref(0);

  // ── 计时器 ────────────────────────────────────────────────────
  const timerRunning = ref(false);
  const timerStart = ref(0);
  const timerElapsed = ref(0);
  const lastKeyAt = ref(0);
  /** 由定时器驱动的当前时间戳，用于让计时显示保持响应式 */
  const nowTick = ref(Date.now());
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── 光标隐藏 ──────────────────────────────────────────────────
  const cursorHidden = ref(false);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  let shakeTimer: ReturnType<typeof setTimeout> | null = null;
  let persistHandler: (() => void) | null = null;

  const activeRoots = computed(() => (mode.value === "merged" ? views.merged : views.all));
  const wrongSet = computed(() => (mode.value === "merged" ? wrongByMode.value.merged : wrongByMode.value.all));
  const wrongProgressSet = computed(() =>
    mode.value === "merged" ? wrongProgressByMode.value.merged : wrongProgressByMode.value.all
  );
  const learningSeenSet = computed(() =>
    mode.value === "merged" ? learningSeenByMode.value.merged : learningSeenByMode.value.all
  );

  const currentItem = computed(() => activeRoots.value[currentItemIndex.value] ?? { root: "—", code: "" });
  const isWrongEmpty = computed(() => practiceMode.value === "wrong" && wrongSet.value.size === 0);
  const displayRoot = computed(() => (isWrongEmpty.value ? "—" : currentItem.value.root));

  const setPersistHandler = (fn: (() => void) | null) => {
    persistHandler = fn;
  };
  const persist = () => persistHandler?.();

  // ── 计时与光标 ────────────────────────────────────────────────
  const focusInput = () => refs.codeInput.value?.focus();

  const pauseTimer = () => {
    if (!timerRunning.value) return;
    timerElapsed.value += nowTick.value - timerStart.value;
    timerRunning.value = false;
    timerStart.value = 0;
  };

  const registerActivity = () => {
    const now = Date.now();
    nowTick.value = now;
    lastKeyAt.value = now;
    if (!timerRunning.value) {
      timerRunning.value = true;
      timerStart.value = now;
    }
  };

  const tickTimer = () => {
    const now = Date.now();
    nowTick.value = now;
    if (timerRunning.value && now - lastKeyAt.value >= TIMER_IDLE_MS) pauseTimer();
  };

  const timerText = computed(() => {
    const total = timerElapsed.value + (timerRunning.value ? nowTick.value - timerStart.value : 0);
    return formatTimer(Math.max(0, total));
  });

  const resetCursorTimer = () => {
    cursorHidden.value = false;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      cursorHidden.value = true;
    }, CURSOR_HIDE_DELAY);
  };

  const shakeInput = () => {
    const el = refs.inputWrap.value;
    if (!el) return;
    el.classList.remove("shake");
    // 强制回流以重播 CSS 动画
    void el.offsetWidth;
    el.classList.add("shake");
    if (shakeTimer) clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => el.classList.remove("shake"), SHAKE_DURATION_MS);
  };

  // ── 遗忘曲线 ──────────────────────────────────────────────────
  const removeFromReviewQueue = (idx: number) => {
    reviewQueue.value = reviewQueue.value.filter(entry => entry.idx !== idx);
  };

  const clearReviewState = () => {
    reviewQueue.value = [];
    reviewState.value.clear();
  };

  const scheduleReview = (idx: number, stepIndex: number) => {
    const step = REVIEW_STEPS[stepIndex];
    if (step === undefined) return;
    removeFromReviewQueue(idx);
    reviewQueue.value = [...reviewQueue.value, { idx, dueAt: turn.value + step }];
  };

  /** 取出一个已到期（`dueAt <= turn`）且到期时间最早的复习项 */
  const getDueReview = (): number | null => {
    if (!reviewQueue.value.length) return null;
    let bestIndex = -1;
    let bestDue = Infinity;
    reviewQueue.value.forEach((entry, i) => {
      if (entry.dueAt <= turn.value && entry.dueAt < bestDue) {
        bestDue = entry.dueAt;
        bestIndex = i;
      }
    });
    if (bestIndex === -1) return null;
    const [entry] = reviewQueue.value.splice(bestIndex, 1);
    return entry.idx;
  };

  /** 取出一个到期时间最早的复习项，不要求已到期 */
  const takeEarliestQueued = (): number | null => {
    if (!reviewQueue.value.length) return null;
    let bestIndex = 0;
    reviewQueue.value.forEach((entry, i) => {
      if (entry.dueAt < reviewQueue.value[bestIndex].dueAt) bestIndex = i;
    });
    const [entry] = reviewQueue.value.splice(bestIndex, 1);
    return entry.idx;
  };

  const buildOrder = () => {
    order.value = shuffle([...activeRoots.value.keys()]);
    currentIndex.value = 0;
  };

  /** 跳过已完成与正在复习的项，前进到下一个新项 */
  const advanceToNextNew = () => {
    while (currentIndex.value < order.value.length) {
      const idx = order.value[currentIndex.value];
      if (!completedSet.value.has(idx) && !reviewState.value.has(idx)) return;
      currentIndex.value += 1;
    }
  };

  // ── 进度派生 ──────────────────────────────────────────────────
  const totalCount = computed(() => activeRoots.value.length);
  const completedCount = computed(() => completedSet.value.size);
  const progressText = computed(() => `${completedCount.value}/${totalCount.value}`);
  const wrongTotal = computed(() => wrongSet.value.size);
  const wrongProgressText = computed(() => `${wrongDone.value}/${wrongTotal.value}`);
  const crowns = computed(() => (mode.value === "merged" ? roundsByMode.value.merged : roundsByMode.value.all));
  const crownText = computed(() => (crowns.value <= 0 ? "" : crowns.value === 1 ? "👑" : `👑×${crowns.value}`));
  const currentStats = computed(() => statsByMode.value[practiceMode.value]);
  const accuracyText = computed(() =>
    currentStats.value.total ? `${Math.round((currentStats.value.correct / currentStats.value.total) * 100)}%` : "0%"
  );

  /**
   * 重算错题进度。
   *
   * 错题模式下「错题进度」满一轮后需要清零重来，因此这里带副作用，
   * 与 legacy `updateProgress()` 的行为保持一致。
   */
  const recomputeWrongProgress = () => {
    let done = 0;
    for (const idx of wrongProgressSet.value) {
      if (wrongSet.value.has(idx)) done += 1;
    }
    if (practiceMode.value === "wrong" && wrongSet.value.size > 0 && done >= wrongSet.value.size) {
      wrongProgressSet.value.clear();
      done = 0;
    }
    wrongDone.value = done;
  };

  const getAutoPalette = (): string => {
    const bucket = Math.floor((completedSet.value.size || 0) / AUTO_PALETTE_STEP);
    const index = (autoPaletteBaseIndex.value + bucket) % PALETTE_OPTIONS.length;
    return PALETTE_OPTIONS[index];
  };

  const maybeAutoPalette = () => {
    if (paletteMode.value !== "auto") return;
    const target = getAutoPalette();
    if (target !== activePalette.value) activePalette.value = target;
  };

  /** 完成一整轮：非错题模式下皇冠 +1，并重设 auto 配色基准 */
  const handleProgressReset = () => {
    if (practiceMode.value !== "wrong") {
      if (mode.value === "merged") roundsByMode.value.merged += 1;
      else roundsByMode.value.all += 1;
    }
    if (paletteMode.value !== "auto") return;
    const active = PALETTE_OPTIONS.indexOf(activePalette.value as (typeof PALETTE_OPTIONS)[number]);
    autoPaletteBaseIndex.value = active >= 0 ? active : 0;
    persist();
  };

  // ── 调度 ──────────────────────────────────────────────────────
  const pickNextItem = () => {
    if (practiceMode.value === "wrong") {
      if (!wrongSet.value.size) {
        currentItemIndex.value = order.value[0] ?? 0;
        currentIsReview.value = false;
        return;
      }
      if (reviewEnabled.value) {
        const dueIdx = getDueReview();
        if (dueIdx !== null) {
          currentItemIndex.value = dueIdx;
          currentIsReview.value = true;
          return;
        }
        const earliest = takeEarliestQueued();
        if (earliest !== null) {
          currentItemIndex.value = earliest;
          currentIsReview.value = true;
          return;
        }
      }
      const wrongList = Array.from(wrongSet.value);
      currentItemIndex.value = wrongList[Math.floor(Math.random() * wrongList.length)];
      currentIsReview.value = false;
      return;
    }

    advanceToNextNew();

    if (reviewEnabled.value) {
      const dueIdx = getDueReview();
      if (dueIdx !== null) {
        currentItemIndex.value = dueIdx;
        currentIsReview.value = true;
        return;
      }
    }

    if (currentIndex.value >= order.value.length) {
      if (reviewEnabled.value) {
        const earliest = takeEarliestQueued();
        if (earliest !== null) {
          currentItemIndex.value = earliest;
          currentIsReview.value = true;
          return;
        }
      }
      if (completedSet.value.size >= activeRoots.value.length) {
        handleProgressReset();
        completedSet.value.clear();
        clearReviewState();
      }
      buildOrder();
      advanceToNextNew();
    }

    currentItemIndex.value =
      currentIndex.value >= order.value.length ? (order.value[0] ?? 0) : order.value[currentIndex.value];
    currentIsReview.value = false;
  };

  // ── 渲染动作 ──────────────────────────────────────────────────
  const showReveal = (code: string) => {
    revealCode.value = code;
    revealVisible.value = true;
  };
  const hideReveal = () => {
    revealCode.value = "";
    revealVisible.value = false;
  };
  const clearBuffer = () => {
    buffer.value = "";
  };

  const markWrong = (rootIndex: number) => {
    wrongSet.value.add(rootIndex);
    wrongProgressSet.value.delete(rootIndex);
    if (reviewEnabled.value) {
      completedSet.value.delete(rootIndex);
      const state = reviewState.value.get(rootIndex) ?? { stage: 0 };
      state.stage = 0;
      reviewState.value.set(rootIndex, state);
      removeFromReviewQueue(rootIndex);
    }
    recomputeWrongProgress();
    maybeAutoPalette();
    persist();
  };

  const markCorrect = (rootIndex: number) => {
    let mastered = false;
    if (!reviewEnabled.value) {
      completedSet.value.add(rootIndex);
      mastered = true;
    } else {
      const state = reviewState.value.get(rootIndex);
      if (!state) {
        completedSet.value.add(rootIndex);
        mastered = true;
      } else {
        state.stage += 1;
        if (state.stage >= REVIEW_STEPS.length) {
          reviewState.value.delete(rootIndex);
          removeFromReviewQueue(rootIndex);
          completedSet.value.add(rootIndex);
          mastered = true;
        } else {
          reviewState.value.set(rootIndex, state);
          scheduleReview(rootIndex, state.stage - 1);
        }
      }
    }
    recomputeWrongProgress();
    maybeAutoPalette();
    if (mastered && wrongSet.value.has(rootIndex)) wrongProgressSet.value.add(rootIndex);
    persist();
  };

  const applyWrong = () => {
    isError.value = true;
    showReveal(currentItem.value.code);
    shakeInput();
    clearBuffer();
    locked.value = false;
    focusInput();
  };

  /** 空格键手动判错 */
  const triggerWrong = () => {
    if (locked.value) return;
    locked.value = true;
    currentStats.value.total += 1;
    markWrong(currentItemIndex.value);
    applyWrong();
  };

  /** 学习模式：首次见到直接给出编码并计为答错 */
  const handleLearningIntro = () => {
    if (practiceMode.value !== "learning") return;
    if (learningSeenSet.value.has(currentItemIndex.value)) return;
    learningSeenSet.value.add(currentItemIndex.value);
    markWrong(currentItemIndex.value);
    showReveal(currentItem.value.code);
  };

  /** 跟打模式：始终展示编码 */
  const handleFollowIntro = () => {
    if (practiceMode.value !== "follow") return;
    showReveal(currentItem.value.code);
  };

  const renderCurrent = () => {
    if (isWrongEmpty.value) {
      clearBuffer();
      showReveal("暂无错题");
      isError.value = false;
      locked.value = true;
      return;
    }
    locked.value = false;
    isError.value = false;
    hideReveal();
    clearBuffer();
    recomputeWrongProgress();
    maybeAutoPalette();
    handleLearningIntro();
    handleFollowIntro();
    focusInput();
  };

  const renderQuestion = () => {
    pickNextItem();
    renderCurrent();
    turn.value += 1;
  };

  const submitAnswer = (value: string) => {
    if (locked.value) return;
    const code = value.slice(0, 2);
    if (code.length < 2) return;

    locked.value = true;
    currentStats.value.total += 1;

    if (code === currentItem.value.code) {
      currentStats.value.correct += 1;
      markCorrect(currentItemIndex.value);
      isError.value = false;
      if (practiceMode.value !== "follow") hideReveal();
      if (!currentIsReview.value && practiceMode.value !== "wrong") currentIndex.value += 1;
      locked.value = false;
      renderQuestion();
    } else {
      markWrong(currentItemIndex.value);
      applyWrong();
    }
  };

  /** 输入变化：满 2 字符自动提交 */
  const handleInput = (value: string) => {
    if (locked.value) return;
    buffer.value = normalizeInput(value);
    if (buffer.value.length >= 2) submitAnswer(buffer.value);
  };

  const setBuffer = (value: string) => {
    if (locked.value) return;
    buffer.value = normalizeInput(value);
    if (buffer.value.length >= 2) submitAnswer(buffer.value);
  };

  // ── 设置切换 ──────────────────────────────────────────────────
  const setRootMode = (next: TigerRootMode) => {
    if (next === mode.value) return;
    const completed = Array.from(completedSet.value);
    const targetCompleted =
      mode.value === "all" && next === "merged"
        ? mapCompletedToMerged(completed, mapping)
        : mode.value === "merged" && next === "all"
          ? mapCompletedToVariants(completed, mapping)
          : new Set<number>();

    mode.value = next;
    completedSet.value.clear();
    targetCompleted.forEach(idx => completedSet.value.add(idx));
    clearReviewState();

    const rebuilt = buildOrderWithCompleted(activeRoots.value.length, targetCompleted, shuffle);
    order.value = rebuilt.order;
    currentIndex.value = rebuilt.resumeAt;

    renderQuestion();
    recomputeWrongProgress();
    persist();
  };

  const setPracticeMode = (next: TigerPracticeMode) => {
    if (next === practiceMode.value) return;
    const wasReviewEnabled = reviewEnabled.value;
    practiceMode.value = next;
    if (reviewEnabled.value !== wasReviewEnabled && !reviewEnabled.value) clearReviewState();

    locked.value = false;
    if (practiceMode.value === "wrong") renderQuestion();
    else renderCurrent();
    recomputeWrongProgress();
    persist();
  };

  const setUiMode = (next: TigerUiMode) => {
    uiMode.value = next;
  };

  const setSchemeMode = (next: TigerSchemeMode) => {
    schemeMode.value = next;
  };

  const setPaletteMode = (next: TigerPaletteMode) => {
    paletteMode.value = next;
    if (paletteMode.value === "auto") {
      const active = PALETTE_OPTIONS.indexOf(activePalette.value as (typeof PALETTE_OPTIONS)[number]);
      const bucket = Math.floor((completedSet.value.size || 0) / AUTO_PALETTE_STEP);
      const base = active - bucket;
      autoPaletteBaseIndex.value = ((base % PALETTE_OPTIONS.length) + PALETTE_OPTIONS.length) % PALETTE_OPTIONS.length;
    }
    activePalette.value = paletteMode.value === "auto" ? getAutoPalette() : paletteMode.value;
  };

  const sizeVars = computed(() => {
    const preset = SIZE_PRESETS[sizeIndex.value];
    return {
      "--root-min": `${preset.rootMin}px`,
      "--root-vw": preset.rootVw,
      "--root-max": `${preset.rootMax}px`,
      "--box-size": `${preset.box}px`,
      "--box-font": `${preset.boxFont}px`,
      "--box-size-mobile": `${preset.boxMobile}px`,
      "--box-font-mobile": `${preset.boxMobileFont}px`,
    };
  });

  const canIncreaseSize = computed(() => sizeIndex.value < SIZE_PRESETS.length - 1);
  const canDecreaseSize = computed(() => sizeIndex.value > 0);

  const increaseSize = () => {
    if (!canIncreaseSize.value) return;
    sizeIndex.value += 1;
    persist();
  };
  const decreaseSize = () => {
    if (!canDecreaseSize.value) return;
    sizeIndex.value -= 1;
    persist();
  };

  // ── 错题操作 ──────────────────────────────────────────────────
  const removeCurrentWrong = () => {
    if (practiceMode.value !== "wrong" || !wrongSet.value.has(currentItemIndex.value)) return;
    wrongSet.value.delete(currentItemIndex.value);
    wrongProgressSet.value.delete(currentItemIndex.value);
    renderQuestion();
    recomputeWrongProgress();
    persist();
  };

  const clearAllWrong = () => {
    wrongByMode.value.all.clear();
    wrongByMode.value.merged.clear();
    wrongProgressByMode.value.all.clear();
    wrongProgressByMode.value.merged.clear();
    if (practiceMode.value === "wrong") renderQuestion();
    recomputeWrongProgress();
    persist();
  };

  const rootClassList = computed(() =>
    buildRootClassList({
      schemeMode: schemeMode.value,
      paletteMode: paletteMode.value,
      activePalette: activePalette.value,
      uiMode: uiMode.value,
      practiceMode: practiceMode.value,
      cursorHidden: cursorHidden.value,
    })
  );

  // ── 序列化 ────────────────────────────────────────────────────
  const serialize = (): TigerCodeSnapshot => ({
    cs: [...completedSet.value],
    wb: { a: [...wrongByMode.value.all], m: [...wrongByMode.value.merged] },
    wp: { a: [...wrongProgressByMode.value.all], m: [...wrongProgressByMode.value.merged] },
    rs: Object.fromEntries(reviewState.value) as Record<string, TigerReviewStage>,
    rq: reviewQueue.value.map(entry => ({ ...entry })),
    t: turn.value,
    st: Object.fromEntries(Object.entries(statsByMode.value).map(([k, v]) => [k, [v.total, v.correct]])),
    rm: { a: roundsByMode.value.all, m: roundsByMode.value.merged },
    ls: { a: [...learningSeenByMode.value.all], m: [...learningSeenByMode.value.merged] },
    md: mode.value,
    pm: practiceMode.value,
    si: sizeIndex.value,
    sm: schemeMode.value,
    pl: paletteMode.value,
    ap: autoPaletteBaseIndex.value,
    ts: Date.now(),
  });

  const restore = (d: TigerCodeSnapshot) => {
    completedSet.value.clear();
    (d.cs ?? []).forEach(i => completedSet.value.add(i));

    wrongByMode.value.all.clear();
    wrongByMode.value.merged.clear();
    (d.wb?.a ?? []).forEach(i => wrongByMode.value.all.add(i));
    (d.wb?.m ?? []).forEach(i => wrongByMode.value.merged.add(i));

    wrongProgressByMode.value.all.clear();
    wrongProgressByMode.value.merged.clear();
    (d.wp?.a ?? []).forEach(i => wrongProgressByMode.value.all.add(i));
    (d.wp?.m ?? []).forEach(i => wrongProgressByMode.value.merged.add(i));

    reviewState.value.clear();
    Object.entries(d.rs ?? {}).forEach(([k, v]) => reviewState.value.set(Number(k), { stage: v.stage }));

    reviewQueue.value = (d.rq ?? []).map(entry => ({ ...entry }));
    turn.value = d.t ?? 0;

    if (d.st) {
      Object.entries(d.st).forEach(([k, v]) => {
        const target = statsByMode.value[k as TigerPracticeMode];
        if (target) {
          target.total = v[0] ?? 0;
          target.correct = v[1] ?? 0;
        }
      });
    } else {
      // 兼容 legacy 早期快照格式：统计只有全局 to / c 两个字段
      statsByMode.value.normal.total = d.to ?? 0;
      statsByMode.value.normal.correct = d.c ?? 0;
    }

    roundsByMode.value.all = d.rm?.a ?? 0;
    roundsByMode.value.merged = d.rm?.m ?? 0;

    learningSeenByMode.value.all.clear();
    learningSeenByMode.value.merged.clear();
    (d.ls?.a ?? []).forEach(i => learningSeenByMode.value.all.add(i));
    (d.ls?.m ?? []).forEach(i => learningSeenByMode.value.merged.add(i));

    if (d.md) mode.value = d.md;
    if (d.pm) {
      // 与 legacy `syncPracticeState()` 保持一致：恢复到关闭复习的练习模式时清空复习状态。
      // 这里不能走 `setPracticeMode()`，因为它会额外触发重渲染与 persist()，而恢复流程需要自己控制顺序。
      const wasReviewEnabled = reviewEnabled.value;
      practiceMode.value = d.pm;
      if (reviewEnabled.value !== wasReviewEnabled && !reviewEnabled.value) clearReviewState();
    }
    if (d.si != null) sizeIndex.value = d.si;
    if (d.sm) schemeMode.value = d.sm;
    if (d.pl) paletteMode.value = d.pl;
    activePalette.value = paletteMode.value === "auto" ? getAutoPalette() : paletteMode.value;
    autoPaletteBaseIndex.value = d.ap ?? 0;

    const rebuilt = buildOrderWithCompleted(activeRoots.value.length, completedSet.value, shuffle);
    order.value = rebuilt.order;
    currentIndex.value = rebuilt.resumeAt;

    if (practiceMode.value === "wrong") renderQuestion();
    else renderCurrent();
    recomputeWrongProgress();
  };

  // ── 全局键盘 ──────────────────────────────────────────────────
  /** 目标是否是可编辑控件；用于避免全局快捷键抢走输入框里的按键 */
  const isEditableTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
  };

  const onGlobalKeydown = (e: KeyboardEvent) => {
    // 页面里除了码位输入框，还有云同步的「粘贴旧设备ID」输入框。
    // 设备 ID 是带 a-f 的 UUID，若只放过自己的输入框，用户根本无法粘贴。
    if (isEditableTarget(e.target)) return;
    registerActivity();
    if (locked.value) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      setBuffer(buffer.value.slice(0, -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitAnswer(buffer.value);
      return;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      triggerWrong();
      return;
    }
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      setBuffer(buffer.value + e.key);
    }
  };

  const onInputKeydown = (e: KeyboardEvent) => {
    registerActivity();
    if (e.key === "Enter") {
      submitAnswer(buffer.value);
      return;
    }
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      triggerWrong();
    }
  };

  onMounted(() => {
    document.addEventListener("keydown", onGlobalKeydown);
    document.addEventListener("mousemove", resetCursorTimer, { passive: true });
    document.addEventListener("mousedown", resetCursorTimer, { passive: true });
    document.addEventListener("wheel", resetCursorTimer, { passive: true });
    resetCursorTimer();
    timerInterval = setInterval(tickTimer, TIMER_TICK_MS);
    buildOrder();
    renderQuestion();
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", onGlobalKeydown);
    document.removeEventListener("mousemove", resetCursorTimer);
    document.removeEventListener("mousedown", resetCursorTimer);
    document.removeEventListener("wheel", resetCursorTimer);
    if (timerInterval) clearInterval(timerInterval);
    if (cursorTimer) clearTimeout(cursorTimer);
    if (shakeTimer) clearTimeout(shakeTimer);
    timerInterval = null;
    cursorTimer = null;
    shakeTimer = null;
    persistHandler = null;
  });

  return {
    // 模式与设置
    mode,
    practiceMode,
    uiMode,
    schemeMode,
    paletteMode,
    activePalette,
    sizeIndex,
    canIncreaseSize,
    canDecreaseSize,
    sizeVars,
    // 渲染状态
    displayRoot,
    currentCode: computed(() => currentItem.value.code),
    buffer,
    revealCode,
    revealVisible,
    isError,
    locked,
    // 统计
    accuracyText,
    progressText,
    wrongProgressText,
    crownText,
    timerText,
    rootClassList,
    // 动作
    handleInput,
    submitAnswer,
    triggerWrong,
    focusInput,
    onInputKeydown,
    setRootMode,
    setPracticeMode,
    setUiMode,
    setSchemeMode,
    setPaletteMode,
    increaseSize,
    decreaseSize,
    removeCurrentWrong,
    clearAllWrong,
    // 序列化 / 同步挂钩
    serialize,
    restore,
    setPersistHandler,
  };
};

export type TigerCodeTrainer = ReturnType<typeof useTigerCodeTrainer>;
