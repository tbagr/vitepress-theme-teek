<script setup lang="ts" name="Wubi86Page">
import { computed, ref } from "vue";
import wubi86 from "@teek/static/img/wubi86.png";
import { wubi86DatasetGroups } from "./datasets";
import { useTypingTrainer } from "./use-typing-trainer";

defineOptions({ name: "Wubi86Page" });

const { activeKey, typed, cells, stats, targetLength, selectDataset, toggleTimer, handleInput } = useTypingTrainer();

const inputRef = ref<HTMLTextAreaElement | null>(null);

const focusInput = () => inputRef.value?.focus();

/** 用时拆成「x分y秒」，不足一分钟只显示秒 */
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}分${rest}秒` : `${rest}秒`;
};

const onSelect = (event: Event) => {
  const el = event.target as HTMLSelectElement | null;
  if (el) selectDataset(el.value);
};

/**
 * 超出目标长度的输入直接截断。
 *
 * 目标层与输入层必须逐字符一一对应才能对齐，一旦用户多打，输入层会多出一截并把两层撑开，
 * 高亮就整体错位。截断只会发生在尾部，此时光标本来就在末尾，重置 selection 不会打断 IME。
 */
const onInput = (event: Event) => {
  const el = event.target as HTMLTextAreaElement | null;
  if (!el) return;

  if (el.value.length > targetLength.value) {
    el.value = el.value.slice(0, targetLength.value);
    el.setSelectionRange(targetLength.value, targetLength.value);
  }

  handleInput(el.value, (event as InputEvent).isComposing);
};

/** 组合态期间（上屏前）不按键计数，只留到 input 事件里结算 */
const onKeydown = (event: KeyboardEvent) => {
  if (event.code !== "F8" || event.isComposing) return;
  event.preventDefault();
  toggleTimer();
};

const progress = computed(() =>
  stats.value.total ? Math.min(100, Math.round((stats.value.typed / stats.value.total) * 100)) : 0
);
</script>

<template>
  <div class="tk-wubi86">
    <div class="tk-wubi86__bar">
      <label class="tk-wubi86__control">
        <span class="tk-wubi86__label">练习内容</span>
        <select class="tk-wubi86__select" :value="activeKey" @change="onSelect">
          <optgroup v-for="group in wubi86DatasetGroups" :key="group.label" :label="group.label">
            <option v-for="dataset in group.datasets" :key="dataset.key" :value="dataset.key">
              {{ dataset.label }}
            </option>
          </optgroup>
        </select>
      </label>

      <dl class="tk-wubi86__stats">
        <div class="tk-wubi86__stat">
          <dt>总字数</dt>
          <dd>{{ stats.total }}</dd>
        </div>
        <div class="tk-wubi86__stat">
          <dt>键入字数</dt>
          <dd>{{ stats.typed }}</dd>
        </div>
        <div class="tk-wubi86__stat">
          <dt>错误数</dt>
          <dd :class="{ 'is-bad': stats.errors > 0 }">{{ stats.errors }}</dd>
        </div>
        <div class="tk-wubi86__stat">
          <dt>正确率</dt>
          <dd>{{ stats.rate }}%</dd>
        </div>
        <div class="tk-wubi86__stat">
          <dt>速度</dt>
          <dd>
            {{ stats.speed }}
            <small>字/分</small>
          </dd>
        </div>
        <div class="tk-wubi86__stat">
          <dt>用时</dt>
          <dd>{{ formatTime(stats.elapsed) }}</dd>
        </div>
      </dl>
    </div>

    <div class="tk-wubi86__progress">
      <div class="tk-wubi86__progress-fill" :style="{ width: `${progress}%` }" />
    </div>

    <!--
      两层等度量叠加是本组件排版的核心：
      目标层负责铺字与上色，输入层用透明底盖在上面，两者 font / line-height / padding / 换行规则完全一致，
      由浏览器统一换行，于是无需任何手写像素偏移。滚动交给 field，textarea 自身 overflow 隐藏不产生滚动条，
      因此两层永远同步滚动，无需 scroll 同步代码。
    -->
    <div class="tk-wubi86__field" @click="focusInput">
      <div class="tk-wubi86__canvas">
        <div class="tk-wubi86__target" aria-hidden="true">
          <span v-for="(cell, index) in cells" :key="index" class="tk-wubi86__char" :data-state="cell.state">
            {{ cell.char }}
          </span>
        </div>

        <textarea
          ref="inputRef"
          class="tk-wubi86__input"
          :value="typed"
          spellcheck="false"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          :aria-label="`打字练习输入区，目标 ${stats.total} 字`"
          @input="onInput"
          @keydown="onKeydown"
        ></textarea>
      </div>
    </div>

    <p class="tk-wubi86__hint">
      <kbd>F8</kbd>
      暂停 / 继续 · 点击输入区聚焦 · 练完后可切换上方练习内容重新开始
    </p>

    <figure class="tk-wubi86__chart">
      <figcaption>字根表</figcaption>
      <img :src="wubi86" alt="练习字根表" width="1440" height="843" loading="lazy" />
    </figure>
  </div>
</template>
