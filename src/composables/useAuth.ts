import { onMounted, ref, type Ref } from "vue";
import type { User } from "@supabase/supabase-js";

import { supabase, isSupabaseConfigured } from "../lib/supabase";

/**
 * Auth-laag (singleton-state: meerdere componenten delen deze refs).
 *
 * `signOut` zet alleen de sessie af; het opruimen van de per-user cache en
 * outbox gebeurt in de `onAuthStateChange`-listener én wordt door App.vue
 * gekoppeld aan `useLists.reset()` (zie composables/useLists.ts).
 */
const user: Ref<User | null> = ref(null);
const initialized: Ref<boolean> = ref(false);
const error: Ref<string | null> = ref(null);

export function useAuth() {
  const configured = isSupabaseConfigured;

  async function init() {
    if (initialized.value) return;
    initialized.value = true;
    if (!supabase) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user.value = session?.user ?? null;

    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null;
    });
    initialized.value = true;
  }

  async function signIn(email: string, password: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      error.value = "De inloggegevens zijn onjuist.";
      return false;
    }
    return true;
  }

  async function signUp(email: string, password: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }
    const { error: err, data } = await supabase.auth.signUp({
      email,
      password,
    });
    if (err) {
      error.value = err.message;
      return false;
    }
    if (!data.session) {
      error.value = "Controleer je e-mail om je account te bevestigen.";
    }
    return true;
  }

  async function resetPassword(email: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    if (err) {
      error.value = err.message;
      return false;
    }
    error.value = "Als dit e-mailadres bekend is, ontvang je een herstelmail.";
    return true;
  }

  async function signOut(): Promise<void> {
    error.value = null;
    await supabase?.auth.signOut();
    user.value = null;
  }

  onMounted(() => {
    void init();
  });

  return {
    user,
    initialized,
    error,
    configured,
    signIn,
    signUp,
    resetPassword,
    signOut,
  };
}
