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
import { buildOrderWithCompleted, createRootViews, mapCompletedToMerged } from "./root-mapping";
import {
  TIGER_PRACTICE_MODES,
  TIGER_ROOT_MODES,
  TIGER_TYPE_KEYS,
  tigerTypeKey,
  type TigerCodeSnapshot,
  type TigerPracticeMode,
  type TigerRootMode,
  type TigerReviewStage,
  type TigerTypeBuckets,
  type TigerUiMode,
  type TigerSchemeMode,
  type TigerPaletteMode,
} from "./types";

/** 10 种类型组合的状态桶 */
const createBuckets = (): TigerTypeBuckets =>
  Object.fromEntries(
    TIGER_TYPE_KEYS.map(key => [
      key,
      {
        completed: new Set<number>(),
        total: 0,
        correct: 0,
        wrong: new Set<number>(),
        wrongProgress: new Set<number>(),
        rounds: 0,
      },
    ])
  ) as TigerTypeBuckets;

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
  /**
   * 10 种类型组合各自独立的进度 / 统计 / 错题 / 皇冠。
   * 键为 `${字根模式}:${练习模式}`，切换任意一种组合都不影响其余九种。
   */
  const buckets = ref<TigerTypeBuckets>(createBuckets());
  /**
   * 复习阶段与队列按字根模式分桶。
   *
   * 根下标只在所属字根模式的数据集内有意义，跨字根模式共享会串号；而同一字根模式下的
   * 5 种练习模式必须共享一份队列，否则在其他模式答对的题永远不会进入「复习」队列。
   */
  const reviewStateByMode = ref<Record<TigerRootMode, Map<number, TigerReviewStage>>>({
    all: new Map<number, TigerReviewStage>(),
    merged: new Map<number, TigerReviewStage>(),
  });
  const reviewQueueByMode = ref<Record<TigerRootMode, { idx: number; dueAt: number }[]>>({ all: [], merged: [] });
  /** 学习模式已见根，按字根模式分桶（仅学习模式读取） */
  const learningSeenByMode = ref({ all: new Set<number>(), merged: new Set<number>() });
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
  /** 当前「字根模式 × 练习模式」组合的状态桶 */
  const bucket = computed(() => buckets.value[tigerTypeKey(mode.value, practiceMode.value)]);
  const completedSet = computed(() => bucket.value.completed);
  const wrongSet = computed(() => bucket.value.wrong);
  const wrongProgressSet = computed(() => bucket.value.wrongProgress);
  const learningSeenSet = computed(() =>
    mode.value === "merged" ? learningSeenByMode.value.merged : learningSeenByMode.value.all
  );
  const reviewState = computed(() => reviewStateByMode.value[mode.value]);
  const reviewQueue = computed(() => reviewQueueByMode.value[mode.value]);

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
    reviewQueueByMode.value[mode.value] = reviewQueueByMode.value[mode.value].filter(entry => entry.idx !== idx);
  };

  const clearReviewState = () => {
    reviewQueueByMode.value[mode.value] = [];
    reviewStateByMode.value[mode.value].clear();
  };

  const scheduleReview = (idx: number, stepIndex: number) => {
    const step = REVIEW_STEPS[stepIndex];
    if (step === undefined) return;
    removeFromReviewQueue(idx);
    reviewQueueByMode.value[mode.value] = [...reviewQueueByMode.value[mode.value], { idx, dueAt: turn.value + step }];
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
  const crowns = computed(() => bucket.value.rounds);
  const crownText = computed(() => (crowns.value <= 0 ? "" : crowns.value === 1 ? "👑" : `👑×${crowns.value}`));
  const accuracyText = computed(() =>
    bucket.value.total ? `${Math.round((bucket.value.correct / bucket.value.total) * 100)}%` : "0%"
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
    if (practiceMode.value !== "wrong") bucket.value.rounds += 1;
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
    bucket.value.total += 1;
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
    bucket.value.total += 1;

    if (code === currentItem.value.code) {
      bucket.value.correct += 1;
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
  /**
   * 切换字根模式。
   *
   * 每种「字根模式 × 练习模式」组合各有独立进度桶，因此这里不再做任何映射，
   * 切过去直接就是另一种类型自己的进度；原先 `all ⇄ merged` 的来回映射会不可逆地
   * 放大进度（变体 5 个 → 归并 3 组 → 展开回 12 个变体）。
   */
  const setRootMode = (next: TigerRootMode) => {
    if (next === mode.value) return;
    mode.value = next;

    const completed = completedSet.value;
    const rebuilt = buildOrderWithCompleted(activeRoots.value.length, completed, shuffle);
    order.value = rebuilt.order;
    currentIndex.value = rebuilt.resumeAt;

    locked.value = false;
    renderQuestion();
    recomputeWrongProgress();
    persist();
  };

  /**
   * 切换练习模式。
   *
   * 与字根模式同理，切换后读到的是该类型自己的进度 / 统计 / 错题 / 皇冠。
   */
  const setPracticeMode = (next: TigerPracticeMode) => {
    if (next === practiceMode.value) return;
    practiceMode.value = next;

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

  /** 清空全部 10 种类型的错题与错题进度 */
  const clearAllWrong = () => {
    for (const key of TIGER_TYPE_KEYS) {
      buckets.value[key].wrong.clear();
      buckets.value[key].wrongProgress.clear();
    }
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
  /**
   * 输出 v2 快照：10 种类型的进度全部写进 `b`，顶层只保留跨类型共享的字段。
   *
   * 不再写出 legacy 的 `cs` / `st` / `wb` / `wp` / `rm`，避免同一份数据出现两套表达
   * 方式而产生歧义；旧快照由 `restore()` 的迁移分支负责读取。
   */
  const serialize = (): TigerCodeSnapshot => {
    const cs: Record<string, number[]> = {};
    const st: Record<string, [number, number]> = {};
    const wb: Record<string, number[]> = {};
    const wp: Record<string, number[]> = {};
    const rm: Record<string, number> = {};
    for (const key of TIGER_TYPE_KEYS) {
      const b = buckets.value[key];
      cs[key] = [...b.completed];
      st[key] = [b.total, b.correct];
      wb[key] = [...b.wrong];
      wp[key] = [...b.wrongProgress];
      rm[key] = b.rounds;
    }

    return {
      b: {
        cs,
        st,
        wb,
        wp,
        rm,
        rs: {
          a: Object.fromEntries(reviewStateByMode.value.all) as Record<string, TigerReviewStage>,
          m: Object.fromEntries(reviewStateByMode.value.merged) as Record<string, TigerReviewStage>,
        },
        rq: {
          a: reviewQueueByMode.value.all.map(entry => ({ ...entry })),
          m: reviewQueueByMode.value.merged.map(entry => ({ ...entry })),
        },
      },
      t: turn.value,
      ls: { a: [...learningSeenByMode.value.all], m: [...learningSeenByMode.value.merged] },
      md: mode.value,
      pm: practiceMode.value,
      si: sizeIndex.value,
      sm: schemeMode.value,
      pl: paletteMode.value,
      ap: autoPaletteBaseIndex.value,
      ts: Date.now(),
    };
  };

  /** 清空全部 10 种类型的桶 */
  const resetBuckets = () => {
    for (const key of TIGER_TYPE_KEYS) {
      const b = buckets.value[key];
      b.completed.clear();
      b.wrong.clear();
      b.wrongProgress.clear();
      b.total = 0;
      b.correct = 0;
      b.rounds = 0;
    }
  };

  /**
   * legacy v1 → v2 迁移：把共享字段展开进 10 个桶。
   *
   * 旧快照里 `cs` / `st` 是不分类型的单份数据，只能按原项目「切换字根模式时做映射」的
   * 规则展开：全字根桶直接沿用 `cs`，归并字根桶沿用 `mapCompletedToMerged(cs)`，
   * 这样用户在归并字根下看到的进度与旧版本一致，不丢原有练习成果。
   */
  const migrateLegacy = (d: TigerCodeSnapshot) => {
    const legacyCompleted = d.cs ?? [];
    const mergedCompleted = mapCompletedToMerged(legacyCompleted, mapping);

    for (const rootMode of TIGER_ROOT_MODES) {
      const isMerged = rootMode === "merged";
      for (const practiceMode of TIGER_PRACTICE_MODES) {
        const b = buckets.value[tigerTypeKey(rootMode, practiceMode)];
        (isMerged ? mergedCompleted : legacyCompleted).forEach(i => b.completed.add(i));
        (isMerged ? (d.wb?.m ?? []) : (d.wb?.a ?? [])).forEach(i => b.wrong.add(i));
        (isMerged ? (d.wp?.m ?? []) : (d.wp?.a ?? [])).forEach(i => b.wrongProgress.add(i));
        b.rounds = (isMerged ? d.rm?.m : d.rm?.a) ?? 0;

        const stats = d.st?.[practiceMode];
        if (stats) {
          b.total = stats[0] ?? 0;
          b.correct = stats[1] ?? 0;
        } else if (practiceMode === "normal") {
          // legacy 更早期快照：统计只有全局 to / c 两个字段
          b.total = d.to ?? 0;
          b.correct = d.c ?? 0;
        }
      }
    }

    // legacy 的复习状态只有一份，其根下标属于保存时所处的字根模式
    const rootMode = d.md ?? "all";
    reviewStateByMode.value.all.clear();
    reviewStateByMode.value.merged.clear();
    reviewQueueByMode.value.all = [];
    reviewQueueByMode.value.merged = [];
    Object.entries(d.rs ?? {}).forEach(([k, v]) => {
      reviewStateByMode.value[rootMode].set(Number(k), { stage: v.stage });
    });
    reviewQueueByMode.value[rootMode] = (d.rq ?? []).map(entry => ({ ...entry }));
  };

  const restore = (d: TigerCodeSnapshot) => {
    resetBuckets();

    // 先落定当前模式，后续派生状态（当前桶、激活数据集）都依赖它
    if (d.md) mode.value = d.md;
    if (d.pm) practiceMode.value = d.pm;

    if (d.b) {
      for (const key of TIGER_TYPE_KEYS) {
        const b = buckets.value[key];
        (d.b.cs?.[key] ?? []).forEach(i => b.completed.add(i));
        (d.b.wb?.[key] ?? []).forEach(i => b.wrong.add(i));
        (d.b.wp?.[key] ?? []).forEach(i => b.wrongProgress.add(i));
        const stats = d.b.st?.[key];
        if (stats) {
          b.total = stats[0] ?? 0;
          b.correct = stats[1] ?? 0;
        }
        b.rounds = d.b.rm?.[key] ?? 0;
      }
      reviewStateByMode.value.all = new Map(
        Object.entries(d.b.rs?.a ?? {}).map(([k, v]) => [Number(k), { stage: v.stage }])
      );
      reviewStateByMode.value.merged = new Map(
        Object.entries(d.b.rs?.m ?? {}).map(([k, v]) => [Number(k), { stage: v.stage }])
      );
      reviewQueueByMode.value.all = (d.b.rq?.a ?? []).map(entry => ({ ...entry }));
      reviewQueueByMode.value.merged = (d.b.rq?.m ?? []).map(entry => ({ ...entry }));
    } else {
      migrateLegacy(d);
    }

    turn.value = d.t ?? 0;

    learningSeenByMode.value.all.clear();
    learningSeenByMode.value.merged.clear();
    (d.ls?.a ?? []).forEach(i => learningSeenByMode.value.all.add(i));
    (d.ls?.m ?? []).forEach(i => learningSeenByMode.value.merged.add(i));

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
