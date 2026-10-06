import { ref, type Ref } from "vue";
import type { User } from "@supabase/supabase-js";

import {
  INVITE_INVALID,
  INVITE_WRONG_EMAIL,
  toAuthErrorMessage,
} from "../lib/errorMessages";
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

/**
 * Staat `true` zodra de app via een herstel-link is geopend. Zorgt ervoor dat
 * `ResetPasswordView` getoond wordt zodra er een wachtwoord gezet moet worden
 * (AGENTS.md §8.11).
 */
const recovery: Ref<boolean> = ref(false);

/** Het app-scheme; hetzelfde als `custom_url_scheme` in `strings.xml`. */
const APP_SCHEME = "com.lijstjes.app";

/** Minimumlengte van het wachtwoord; hetzelfde beleid als Supabase hanteert. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Zet de herstel-status. Exposed op module-niveau zodat `useDeepLink` de
 * herstel-link kan markeren zonder dat `useAuth` de deep link hoeft te kennen.
 */
export function setRecovery(value: boolean): void {
  recovery.value = value;
}

export function useAuth() {
  const configured = isSupabaseConfigured;

  // Eénmalige init-guard: zolang de sessie nog niet bekend is, blijft
  // `initialized` false zodat App.vue het laadscherm toont (§8.7/C3). De
  // splash verdwijnt dus pas zodra `getSession()` antwoord heeft.
  let initStarted = false;

  async function init() {
    if (initStarted) return;
    initStarted = true;
    if (!supabase) {
      initialized.value = true;
      return;
    }
    try {
      supabase.auth.onAuthStateChange((event, session) => {
        user.value = session?.user ?? null;
        // Bij een herstel-link die als page-load binnenkomt (webvariant) vuurt
        // hier het recovery-event; via een deep link zet `useDeepLink` de vlag.
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      user.value = session?.user ?? null;
    } finally {
      initialized.value = true;
    }
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

  /**
   * Registratie via uitnodiging (AGENTS.md §7.6).
   *
   * De volgorde is bewust: eerst de uitnodiging opëisen, dan pas `signUp`. Zou
   * je andersom werken, dan kan iemand zonder token een account aanmaken op een
   * geadresseerd e-mailadres en zo de uitnodiging verbranden.
   *
   * De client-controle is een gebruiksvriendelijke vooraudit; de échte
   * afdwinging gebeurt in de database (`before insert on auth.users`).
   */
  async function acceptInvite(
    email: string,
    password: string,
    token: string,
  ): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }

    const claim = await claimInvite(token);
    if (!claim.valid) {
      error.value = INVITE_INVALID;
      return false;
    }
    if (
      claim.email &&
      claim.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      error.value = INVITE_WRONG_EMAIL;
      return false;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      error.value = `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens hebben.`;
      return false;
    }

    const { error: err, data } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (err) {
      // De triggerfout `no_active_invite` is een databasefout in het Engels;
      // die mag de gebruiker nooit zien.
      error.value = toAuthErrorMessage(err);
      return false;
    }

    if (!data.session) {
      // Supabase-beleid: zonder sessie moet de gebruiker zijn mail bevestigen.
      error.value = "Controleer je e-mail om je account te bevestigen.";
      return true;
    }

    return true;
  }

  /** Roept de RPC `claim_invite` aan; fouten worden als ongeldig behandeld. */
  async function claimInvite(
    token: string,
  ): Promise<{ valid: boolean; email: string | null }> {
    if (!supabase || !token) return { valid: false, email: null };

    try {
      const { data, error: err } = await supabase.rpc("claim_invite", {
        in_token: token,
      });
      if (err || !data) return { valid: false, email: null };
      return { valid: Boolean(data.valid), email: data.email ?? null };
    } catch {
      // Netwerkfout of onverwachte respons: niet als foutmelding tonen, want
      // `acceptInvite` zet zelf een leesbare NL-melding.
      return { valid: false, email: null };
    }
  }

  async function resetPassword(email: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      // Eigen scheme, geen webadres: de app draait zonder webhost.
      redirectTo: `${APP_SCHEME}://`,
    });
    if (err) {
      error.value = toAuthErrorMessage(err);
      return false;
    }
    // Geen SMTP (bewust besluit, AGENTS.md §8.11): de aflevering is beperkt.
    // We beloven daarom niet dat de mail aankomt, en wijzen op het vangnet.
    error.value =
      "Als dit e-mailadres bekend is, ontvang je een herstelmail. Die kan door de afleverbeperking van Supabase wel eens uitblijven of in de spam belanden — vraag dan de beheerder om een nieuw wachtwoord.";
    return true;
  }

  /**
   * Zet een nieuw wachtwoord na een herstel-link. De sessie is op dat moment
   * al een recovery-sessie, dus dit is een gewone `updateUser`-call.
   */
  async function updatePassword(newPassword: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      error.value = `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens hebben.`;
      return false;
    }
    const { error: err } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (err) {
      error.value = toAuthErrorMessage(err);
      return false;
    }
    setRecovery(false);
    return true;
  }

  async function signOut(): Promise<void> {
    error.value = null;
    await supabase?.auth.signOut();
    user.value = null;
    setRecovery(false);
  }

  // `onMounted` staat bewust NIET meer in deze composable: buiten een
  // component-context werkt dat niet, en het maakt de auth-laag ontestbaar onder
  // vitest. `App.vue` roept `init()` aan in zijn eigen `onMounted` (A2.2).

  return {
    user,
    initialized,
    error,
    configured,
    recovery,
    init,
    signIn,
    acceptInvite,
    resetPassword,
    updatePassword,
    signOut,
  };
}
