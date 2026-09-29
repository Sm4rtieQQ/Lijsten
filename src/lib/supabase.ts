import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// `import.meta.env` bestaat niet in Node-omgevingen (bv. tests). De guard
// houdt `src/lib/supabase.ts` veilig voor zowel Vite als Node.
const env = import.meta.env ?? {};

const supabaseUrl: string | undefined = env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = env.VITE_SUPABASE_ANON_KEY;

/** `false` wanneer de env-variabelen ontbreken; de app toont dan een melding i.p.v. te crashen. */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && supabaseAnonKey,
);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;
