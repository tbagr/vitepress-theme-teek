import { computed, onMounted, onUnmounted, ref } from "vue";
import { isClient } from "@teek/helper";
import { SYNC_THROTTLE_MS, SYNC_TIMEOUT_MS, SYNC_USER_ID_KEY } from "./constants";
import type { TigerCodeSnapshot } from "./types";
import type { TigerCodeTrainer } from "./use-tiger-code-trainer";

/** 同步状态栏的视觉状态 */
export type TigerSyncState = "" | "syncing" | "error";

/** 同步流程阶段 */
export type TigerSyncPhase = "setup" | "connected";

/**
 * 虎码练习进度云同步。
 *
 * 通过 Supabase 的 PostgREST 接口读写 `progress` 表，不引入 `@supabase/supabase-js` 依赖。
 *
 * 密钥从 Vite 环境变量读取：
 * - `VITE_TIGER_CODE_SUPABASE_URL`
 * - `VITE_TIGER_CODE_SUPABASE_ANON_KEY`
 *
 * 两者任一缺失时 `configured` 为 `false`，同步条降级为「云同步未配置」，
 * 其余练习功能不受影响。绝不在源码中硬编码项目地址或密钥。
 */
export const useTigerCodeSync = (trainer: TigerCodeTrainer) => {
  const supabaseUrl = import.meta.env.VITE_TIGER_CODE_SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey = import.meta.env.VITE_TIGER_CODE_SUPABASE_ANON_KEY?.trim() ?? "";

  /** 是否已完成云同步配置 */
  const configured = computed(() => Boolean(supabaseUrl && supabaseAnonKey));

  /**
   * 缺失的环境变量名。
   *
   * 未配置时只显示「云同步未配置」是个死胡同：用户无从判断该补什么，
   * 容易误以为是页面 bug。这里把缺失项直接列出来，让提示可操作。
   */
  const missingEnvNames = computed(() => {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("VITE_TIGER_CODE_SUPABASE_URL");
    if (!supabaseAnonKey) missing.push("VITE_TIGER_CODE_SUPABASE_ANON_KEY");
    return missing;
  });

  const userId = ref("");
  const idInput = ref("");
  const phase = ref<TigerSyncPhase | "">("");
  const statusText = ref(
    configured.value
      ? "未同步"
      : `云同步未配置：未读取到 ${missingEnvNames.value.join("、")}。请确认 docs/.env 已配置并重启 dev server（Vite 仅在启动时读取 .env，事后新增不会生效）`
  );
  const statusState = ref<TigerSyncState>("");

  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (text: string, state: TigerSyncState = "") => {
    statusText.value = text;
    statusState.value = state;
  };

  /** 短暂提示后回到「已同步」 */
  const flashStatus = (text: string, delay = 1500) => {
    setStatus(text);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => setStatus("已同步"), delay);
  };

  const authHeaders = (): Record<string, string> => ({
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
  });

  const tableUrl = () => `${supabaseUrl}/rest/v1/progress`;

  /**
   * 带超时的 `fetch`。
   *
   * 网络被 DNS 黑洞或防火墙丢包时，`fetch` 既不 resolve 也不 reject，
   * 状态会永远停在「同步中…」。这里用 `AbortController` 兜底，保证状态能收敛成可见结果。
   */
  const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  /** 超时、DNS 不可达要给出可区分的提示，否则只显示「失败」很难排查 */
  const networkErrorText = (error: unknown, fallback: string) => {
    const name = (error as { name?: string } | null)?.name;
    // AbortController 超时
    if (name === "AbortError") return "网络超时，请检查网络";
    // fetch 在 DNS 解析失败 / 连接被拒时抛 TypeError
    if (name === "TypeError") return "网络不可达，请检查网络或代理";
    return fallback;
  };

  /** 推送本地进度（upsert：有则更新，无则插入） */
  const pushProgress = async () => {
    if (!configured.value || !userId.value) return;
    setStatus("同步中…", "syncing");
    try {
      const response = await fetchWithTimeout(`${tableUrl()}?on_conflict=user_id`, {
        method: "POST",
        headers: { ...authHeaders(), Prefer: "resolution=merge-duplicates" },
        // 与 legacy 一致：按东八区写入不带时区的时间戳
        body: JSON.stringify({
          user_id: userId.value,
          data: trainer.serialize(),
          updated_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("Z", ""),
        }),
      });
      if (!response.ok) {
        setStatus(`同步失败（HTTP ${response.status}）`, "error");
        return;
      }
      setStatus("已同步");
    } catch (error) {
      setStatus(networkErrorText(error, "同步失败"), "error");
    }
  };

  /** 节流推送：60 秒内多次变化只推最后一次 */
  const scheduleSync = () => {
    if (!configured.value) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      void pushProgress();
    }, SYNC_THROTTLE_MS);
  };

  /** 拉取远端进度覆盖本地；远端无数据时推送本地初始状态 */
  const pullProgress = async () => {
    if (!configured.value || !userId.value) return;
    setStatus("拉取中…", "syncing");
    try {
      const response = await fetchWithTimeout(
        `${tableUrl()}?user_id=eq.${encodeURIComponent(userId.value)}&select=data&limit=1`,
        { headers: { ...authHeaders(), Accept: "application/json" } }
      );
      if (!response.ok) {
        setStatus(`拉取失败（HTTP ${response.status}）`, "error");
        return;
      }
      const rows: unknown = await response.json();
      const row = Array.isArray(rows) ? (rows[0] as { data?: TigerCodeSnapshot } | undefined) : undefined;
      if (row?.data) {
        trainer.restore(row.data);
        setStatus("已同步");
      } else {
        setStatus("本地无远端进度，已就绪");
        await pushProgress();
      }
    } catch (error) {
      setStatus(networkErrorText(error, "拉取失败"), "error");
    }
  };

  /** 建立连接：传入旧设备 ID 则跨设备同步，留空则新建 */
  const connect = async (inputId: string) => {
    if (!configured.value) return;
    userId.value = inputId.trim() || crypto.randomUUID();
    if (isClient) localStorage.setItem(SYNC_USER_ID_KEY, userId.value);
    phase.value = "connected";
    await pullProgress();
    scheduleSync();
  };

  /** 「连接」按钮：已有 ID 直接连，否则先让用户粘贴旧 ID */
  const handleSetup = () => {
    if (!configured.value) return;
    if (userId.value) {
      void connect(userId.value);
      return;
    }
    phase.value = "setup";
  };

  /** 「确认」按钮：留空表示新建设备 */
  const handleConfirmId = () => {
    const value = idInput.value.trim();
    void connect(value);
  };

  /** 「同步」按钮：先推再拉 */
  const handleSync = async () => {
    await pushProgress();
    await pullProgress();
  };

  /** 复制设备 ID，便于粘贴到其他设备 */
  const handleCopyId = async () => {
    if (!userId.value) return;
    try {
      await navigator.clipboard.writeText(userId.value);
      flashStatus("ID 已复制");
    } catch {
      setStatus("复制失败", "error");
    }
  };

  // 练习状态变化时节流推送
  trainer.setPersistHandler(scheduleSync);

  onMounted(() => {
    if (!configured.value || !isClient) return;
    const saved = localStorage.getItem(SYNC_USER_ID_KEY);
    if (saved) void connect(saved);
  });

  onUnmounted(() => {
    if (syncTimer) clearTimeout(syncTimer);
    if (statusTimer) clearTimeout(statusTimer);
    syncTimer = null;
    statusTimer = null;
    trainer.setPersistHandler(null);
  });

  return {
    configured,
    missingEnvNames,
    userId,
    idInput,
    phase,
    statusText,
    statusState,
    handleSetup,
    handleConfirmId,
    handleSync,
    handleCopyId,
  };
};

export type TigerCodeSync = ReturnType<typeof useTigerCodeSync>;
