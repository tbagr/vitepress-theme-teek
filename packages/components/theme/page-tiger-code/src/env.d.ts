/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 虎码练习云同步的 Supabase 项目地址，形如 `https://xxxx.supabase.co` */
  readonly VITE_TIGER_CODE_SUPABASE_URL?: string;
  /** 虎码练习云同步的 Supabase anon key（仅匿名权限，非 service_role） */
  readonly VITE_TIGER_CODE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
