import { ref, type Ref } from "vue";
import type { User } from "@supabase/supabase-js";

import {
  EMAIL_NOT_CONFIRMED,
  isEmailNotConfirmed,
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

/**
 * E-mailadres waarvoor een verificatiemail is verzonden. Zolang dit gevuld is
 * (en er nog geen sessie is) toont `App.vue` de verificatiepagina (AGENTS.md §7.6).
 */
const verificationEmail: Ref<string | null> = ref(null);

/**
 * Staat kort op `true` nadat het e-mailadres via de bevestigingslink is
 * bevestigd, zodat de app één groene bevestiging kan tonen (AGENTS.md §7.6).
 */
const justVerified: Ref<boolean> = ref(false);

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

/** Idem, voor de bevestiging na een e-mailverificatie. */
export function setJustVerified(value: boolean): void {
  justVerified.value = value;
}

/** Idem, voor het adres van de verificatiepagina. */
export function setVerificationEmail(value: string | null): void {
  verificationEmail.value = value;
}

/** Ligt de app binnen Capacitor (dus niet in een gewone browser)? */
function isNativePlatform(): boolean {
  const cap = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/**
 * Doel van de web-redirect: origin **plus** pad van de huidige pagina.
 *
 * Alleen de origin is te weinig wanneer de app onder een subpad draait — zoals de
 * GitHub Pages-projectpagina `/Lijsten/` — want dan wijst de mail naar de root
 * (404). Leeg in omgevingen zonder `location` (bv. Node).
 */
export function webRedirectTarget(
  location: { origin?: string; pathname?: string } | undefined,
): string | null {
  if (!location?.origin) return null;
  return `${location.origin}${location.pathname ?? ""}`;
}

/**
 * Waar Supabase de bevestigings- en herstelmail naartoe stuurt.
 *
 * Native: het eigen scheme `com.lijstjes.app://` (deep link, AGENTS.md §8.11).
 * Web: de volledige pagina-URL, zodat registreren en bevestigen zowel in
 * `npm run dev` als op de GitHub Pages-projectpagina blijft werken (AGENTS.md §10.3).
 */
function emailRedirectTo(): string {
  if (isNativePlatform()) return `${APP_SCHEME}://`;
  const target =
    typeof window !== "undefined" ? webRedirectTarget(window.location) : null;
  return target ?? `${APP_SCHEME}://`;
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
      supabase.auth.onAuthStateChange((_event, session) => {
        user.value = session?.user ?? null;
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

    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        if (isEmailNotConfirmed(err)) {
          // Stuur de gebruiker naar de verificatiepagina.
          verificationEmail.value = email.trim();
          error.value = EMAIL_NOT_CONFIRMED;
        } else {
          // "Invalid login credentials" mapt naar dezelfde NL-tekst als
          // voorheen; netwerk-/rate-limitfouten krijgen hun eigen vriendelijke
          // melding (§7.5).
          error.value = toAuthErrorMessage(err);
        }
        return false;
      }
    } catch (thrown) {
      error.value = toAuthErrorMessage(thrown);
      return false;
    }

    verificationEmail.value = null;
    return true;
  }

  /**
   * Open registratie (AGENTS.md §7.6).
   *
   * Met "Confirm email" AAN geeft `signUp` geen sessie terug: de gebruiker moet
   * eerst op de link in de bevestigingsmail klikken. Bij succes zetten we
   * `verificationEmail`, zodat `App.vue` de verificatiepagina toont.
   */
  async function register(email: string, password: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      error.value = "Vul je e-mailadres in.";
      return false;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      error.value = `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens hebben.`;
      return false;
    }

    try {
      const { error: err } = await supabase.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      if (err) {
        error.value = toAuthErrorMessage(err);
        return false;
      }
    } catch (thrown) {
      error.value = toAuthErrorMessage(thrown);
      return false;
    }

    verificationEmail.value = trimmed;
    return true;
  }

  /** Vraag een nieuwe verificatielink aan (Supabase-drempel: enkele per uur). */
  async function resendVerification(email: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }

    const trimmed = email.trim();
    if (!trimmed) {
      error.value = "Vul je e-mailadres in.";
      return false;
    }

    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: trimmed,
        options: { emailRedirectTo: emailRedirectTo() },
      });
      if (err) {
        error.value = toAuthErrorMessage(err);
        return false;
      }
    } catch (thrown) {
      error.value = toAuthErrorMessage(thrown);
      return false;
    }
    return true;
  }

  async function resetPassword(email: string): Promise<boolean> {
    error.value = null;
    if (!supabase) {
      error.value = "Supabase is nog niet geconfigureerd.";
      return false;
    }

    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        // Eigen scheme, geen webadres: de app draait zonder webhost.
        redirectTo: emailRedirectTo(),
      });
      if (err) {
        error.value = toAuthErrorMessage(err);
        return false;
      }
    } catch (thrown) {
      error.value = toAuthErrorMessage(thrown);
      return false;
    }

    // Geen SMTP (bewust besluit, AGENTS.md §8.11): de aflevering is beperkt.
    // We beloven daarom niet dat de mail altijd aankomt.
    error.value =
      "Als dit e-mailadres bekend is, ontvang je een herstelmail. Die kan door de afleverbeperking van Supabase uitblijven of in de spam belanden.";
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

    try {
      const { error: err } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (err) {
        error.value = toAuthErrorMessage(err);
        return false;
      }
    } catch (thrown) {
      error.value = toAuthErrorMessage(thrown);
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
    setJustVerified(false);
    setVerificationEmail(null);
  }

  // `onMounted` staat bewust NIET in deze composable: buiten een
  // component-context werkt dat niet, en het maakt de auth-laag ontestbaar onder
  // vitest. `App.vue` roept `init()` aan in zijn eigen `onMounted` (§5).

  return {
    user,
    initialized,
    error,
    configured,
    recovery,
    verificationEmail,
    justVerified,
    init,
    signIn,
    register,
    resendVerification,
    resetPassword,
    updatePassword,
    signOut,
    setRecovery,
    setJustVerified,
    setVerificationEmail,
  };
}
