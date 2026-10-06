<script setup lang="ts" name="TigerCodePage">
import { computed, ref } from "vue";
// ICP 图标与主题 footer-info 共用同一张图；公安备案图 legacy 单独提供，尺寸不同，故单独存放
import icpRecordImg from "@teek/static/img/icp-record.png";
import tigerBeianImg from "@teek/static/img/tiger-beian.png";
import { PALETTE_OPTIONS } from "./constants";
import { useTigerCodeSync } from "./use-tiger-code-sync";
import { useTigerCodeTrainer } from "./use-tiger-code-trainer";
import type { TigerPaletteMode, TigerPracticeMode, TigerRootMode, TigerSchemeMode, TigerUiMode } from "./types";

defineOptions({ name: "TigerCodePage" });

const codeInputRef = ref<HTMLInputElement | null>(null);
const inputWrapRef = ref<HTMLElement | null>(null);

const trainer = useTigerCodeTrainer({ codeInput: codeInputRef, inputWrap: inputWrapRef });
const sync = useTigerCodeSync(trainer);

/** 配色下拉里两个方案沿用 legacy 的简称 */
const paletteLabels: Record<string, string> = { tokyonight: "Tokyo", rosepine: "Rose" };

/** 配色下拉项：auto 单独置顶，其余按 PALETTE_OPTIONS 顺序展示 */
const paletteChoices = [
  { value: "auto" as TigerPaletteMode, label: "Auto" },
  ...PALETTE_OPTIONS.map(value => ({ value: value as TigerPaletteMode, label: paletteLabels[value] ?? value })),
];

const rootModes: { value: TigerRootMode; label: string }[] = [
  { value: "all", label: "全字根" },
  { value: "merged", label: "归并字根" },
];

const practiceModes: { value: TigerPracticeMode; label: string; title: string }[] = [
  { value: "learning", label: "学习", title: "首次出现显示代码，视为答错；使用遗忘曲线安排复习；不显示准确率" },
  { value: "normal", label: "普通", title: "使用遗忘曲线安排复习" },
  { value: "review", label: "复习", title: "不使用遗忘曲线，仅按题目顺序练习" },
  { value: "follow", label: "跟打", title: "始终显示代码，适合跟打练习" },
  { value: "wrong", label: "错题", title: "答错加入错题集合，使用遗忘曲线安排复习" },
];

const uiModes: { value: TigerUiMode; label: string; title: string }[] = [
  { value: "show", label: "不隐", title: "始终显示代码和拼音" },
  { value: "half", label: "半隐", title: "输入前隐藏，输入后显示代码" },
  { value: "full", label: "全隐", title: "始终隐藏代码和拼音" },
];

/** 两个码位输入框的显示字符，未输入的位置补空串 */
const codeBoxes = computed(() => [trainer.buffer.value[0] ?? "", trainer.buffer.value[1] ?? ""]);

const onInput = (event: Event) => {
  const el = event.target as HTMLInputElement | null;
  if (!el) return;
  trainer.handleInput(el.value);
};

const onPaletteChange = (event: Event) => {
  const el = event.target as HTMLSelectElement | null;
  if (el) trainer.setPaletteMode(el.value as TigerPaletteMode);
};

const onIdKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Enter") return;
  sync.handleConfirmId();
};
</script>

<template>
  <div :class="trainer.rootClassList.value" :style="trainer.sizeVars.value">
    <div class="app">
      <header>
        <div class="title">虎码字根练习</div>
        <div class="top-meta">
          <div class="side-controls">
            <div class="size-controls">
              <button
                class="size-btn"
                type="button"
                aria-label="缩小"
                :disabled="!trainer.canDecreaseSize.value"
                @click="trainer.decreaseSize"
              >
                小
              </button>
              <button
                class="size-btn"
                type="button"
                aria-label="放大"
                :disabled="!trainer.canIncreaseSize.value"
                @click="trainer.increaseSize"
              >
                大
              </button>
            </div>
            <div class="mode-switch" role="group" aria-label="主题">
              <button
                class="mode-btn"
                :class="{ 'is-active': trainer.schemeMode.value === 'light' }"
                type="button"
                :aria-pressed="trainer.schemeMode.value === 'light'"
                @click="trainer.setSchemeMode('light' as TigerSchemeMode)"
              >
                白
              </button>
              <button
                class="mode-btn"
                :class="{ 'is-active': trainer.schemeMode.value === 'dark' }"
                type="button"
                :aria-pressed="trainer.schemeMode.value === 'dark'"
                @click="trainer.setSchemeMode('dark' as TigerSchemeMode)"
              >
                黑
              </button>
            </div>
            <label class="palette-select" aria-label="配色">
              <select :value="trainer.paletteMode.value" aria-label="配色" @change="onPaletteChange">
                <option v-for="choice in paletteChoices" :key="choice.value" :value="choice.value">
                  {{ choice.label }}
                </option>
              </select>
            </label>
            <div class="mode-switch" role="group" aria-label="界面显示">
              <button
                v-for="item in uiModes"
                :key="item.value"
                class="mode-btn"
                :class="{ 'is-active': trainer.uiMode.value === item.value }"
                type="button"
                :aria-pressed="trainer.uiMode.value === item.value"
                :title="item.title"
                @click="trainer.setUiMode(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
          <div class="controls">
            <div class="mode-switch" role="group" aria-label="字根模式">
              <button
                v-for="item in rootModes"
                :key="item.value"
                class="mode-btn"
                :class="{ 'is-active': trainer.mode.value === item.value }"
                type="button"
                :aria-pressed="trainer.mode.value === item.value"
                @click="trainer.setRootMode(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
            <div class="mode-switch" role="group" aria-label="练习模式">
              <button
                v-for="item in practiceModes"
                :key="item.value"
                class="mode-btn"
                :class="{ 'is-active': trainer.practiceMode.value === item.value }"
                type="button"
                :aria-pressed="trainer.practiceMode.value === item.value"
                :title="item.title"
                @click="trainer.setPracticeMode(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <section class="card" @click="trainer.focusInput">
        <div class="card-meta">
          <div class="stat stat-accuracy">
            准确率：
            <strong>{{ trainer.accuracyText.value }}</strong>
          </div>
          <div class="stat stat-progress">
            进度：
            <strong>{{ trainer.progressText.value }}</strong>
          </div>
          <div class="stat stat-crown" :class="{ 'is-empty': !trainer.crownText.value }">
            {{ trainer.crownText.value }}
          </div>
          <div class="stat stat-timer">
            计时：
            <strong>{{ trainer.timerText.value }}</strong>
          </div>
          <div class="stat stat-wrong">
            错题进度：
            <strong>{{ trainer.wrongProgressText.value }}</strong>
          </div>
          <div class="wrong-actions">
            <button class="wrong-action-btn" type="button" title="删除当前错题" @click="trainer.removeCurrentWrong">
              删除
            </button>
            <button
              class="wrong-action-btn wrong-action-btn--danger"
              type="button"
              title="清空所有错题"
              @click="trainer.clearAllWrong"
            >
              清空
            </button>
          </div>
        </div>
        <div class="root-char">{{ trainer.displayRoot.value }}</div>
        <div class="reveal" :class="{ 'is-show': trainer.revealVisible.value }" aria-live="polite">
          {{ trainer.revealCode.value }}
        </div>

        <div ref="inputWrapRef" class="input-wrap" :class="{ 'is-error': trainer.isError.value }">
          <input
            ref="codeInputRef"
            class="code-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength="2"
            :value="trainer.buffer.value"
            @input="onInput"
            @keydown="trainer.onInputKeydown"
          />
          <div class="code-boxes" aria-hidden="true">
            <div v-for="(char, i) in codeBoxes" :key="i" class="code-box" :data-pos="i">{{ char }}</div>
          </div>
        </div>
      </section>

      <footer class="footer">
        <div class="footer-row footer-row--legal">
          <span class="footer-center">
            <span>© 2026 虎码字根练习</span>
            <a class="footer-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
              <img class="footer-icon" :src="icpRecordImg" alt="ICP备案" width="14" height="14" />
              <span>皖ICP备2023005643号</span>
            </a>
            <a
              class="footer-link"
              href="http://www.beian.gov.cn/portal/registerSystem?recordcode=34120402000424"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img class="footer-icon" :src="tigerBeianImg" alt="公安备案" width="14" height="14" />
              <span>皖公网安备34120402000424号</span>
            </a>
          </span>
        </div>
      </footer>

      <div class="sync-bar">
        <span class="sync-status" :class="sync.statusState.value ? `is-${sync.statusState.value}` : ''">
          {{ sync.statusText.value }}
        </span>
        <button
          v-if="sync.phase.value === '' && sync.configured.value"
          class="sync-btn sync-btn-setup"
          type="button"
          @click="sync.handleSetup"
        >
          连接
        </button>
        <template v-if="sync.phase.value === 'setup'">
          <input
            v-model="sync.idInput.value"
            class="sync-id-input"
            type="text"
            placeholder="粘贴旧设备ID可同步进度，新用户直接确认"
            @keydown="onIdKeydown"
          />
          <button class="sync-btn sync-btn-confirm" type="button" @click="sync.handleConfirmId">确认</button>
        </template>
        <template v-if="sync.phase.value === 'connected'">
          <button class="sync-btn sync-btn-push" type="button" @click="sync.handleSync">同步</button>
          <span class="sync-id-display" :title="`点击复制 ID：${sync.userId.value}`" @click="sync.handleCopyId">
            {{ sync.userId.value }}
          </span>
        </template>
      </div>
    </div>
  </div>
</template>
