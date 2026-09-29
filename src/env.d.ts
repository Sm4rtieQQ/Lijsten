/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Zie `.env.example`. */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/publishable key. Veilig voor client-gebruik mits RLS aanstaat. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, unknown, unknown>;
  export default component;
}
