import { ref, type Ref } from "vue";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "../lib/database.types";
import {
  EMAIL_NOT_CONFIRMED,
  isEmailNotConfirmed,
  toAuthErrorMessage,
} from "../lib/errorMessages";
import { emailRedirectTo } from "../lib/platform";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { EMAIL_REQUIRED, passwordLengthError } from "../lib/validation";

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

const NOT_CONFIGURED = "Supabase is nog niet geconfigureerd.";

/**
 * Melding na een herstelverzoek. Geen SMTP (bewust besluit, AGENTS.md §8.11):
 * de aflevering is beperkt, dus we beloven niet dat de mail altijd aankomt.
 */
const RESET_REQUESTED =
  "Als dit e-mailadres bekend is, ontvang je een herstelmail. Die kan door de afleverbeperking van Supabase uitblijven of in de spam belanden.";

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

interface AuthActionOptions {
  /** Validatie vóór de server-call; een string is de foutmelding. */
  validate?: () => string | null;
  /** Eigen mapping van een door Supabase teruggegeven fout. */
  onError?: (err: unknown) => string;
  onSuccess?: () => void;
}

/**
 * Gemeenschappelijk verloop van elke auth-actie: fout wissen → configuratie-
 * check → validatie → server-call → fout altijd naar NL-tekst mappen (§7.5).
 * Reject nooit; het resultaat is `true` bij succes.
 */
async function runAuthAction(
  action: (client: SupabaseClient<Database>) => Promise<{ error: unknown }>,
  options: AuthActionOptions = {},
): Promise<boolean> {
  error.value = null;
  if (!supabase) {
    error.value = NOT_CONFIGURED;
    return false;
  }
  const invalid = options.validate?.() ?? null;
  if (invalid) {
    error.value = invalid;
    return false;
  }

  try {
    const { error: err } = await action(supabase);
    if (err) {
      error.value = (options.onError ?? toAuthErrorMessage)(err);
      return false;
    }
  } catch (thrown) {
    error.value = toAuthErrorMessage(thrown);
    return false;
  }

  options.onSuccess?.();
  return true;
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

  function signIn(email: string, password: string): Promise<boolean> {
    return runAuthAction(
      (client) => client.auth.signInWithPassword({ email, password }),
      {
        onError: (err) => {
          if (!isEmailNotConfirmed(err)) return toAuthErrorMessage(err);
          // Stuur de gebruiker naar de verificatiepagina.
          verificationEmail.value = email.trim();
          return EMAIL_NOT_CONFIRMED;
        },
        onSuccess: () => {
          verificationEmail.value = null;
        },
      },
    );
  }

  /**
   * Open registratie (AGENTS.md §7.6).
   *
   * Met "Confirm email" AAN geeft `signUp` geen sessie terug: de gebruiker moet
   * eerst op de link in de bevestigingsmail klikken. Bij succes zetten we
   * `verificationEmail`, zodat `App.vue` de verificatiepagina toont.
   */
  function register(email: string, password: string): Promise<boolean> {
    const trimmed = email.trim();
    return runAuthAction(
      (client) =>
        client.auth.signUp({
          email: trimmed,
          password,
          options: { emailRedirectTo: emailRedirectTo() },
        }),
      {
        validate: () =>
          trimmed ? passwordLengthError(password) : EMAIL_REQUIRED,
        onSuccess: () => {
          verificationEmail.value = trimmed;
        },
      },
    );
  }

  /** Vraag een nieuwe verificatielink aan (Supabase-drempel: enkele per uur). */
  function resendVerification(email: string): Promise<boolean> {
    const trimmed = email.trim();
    return runAuthAction(
      (client) =>
        client.auth.resend({
          type: "signup",
          email: trimmed,
          options: { emailRedirectTo: emailRedirectTo() },
        }),
      { validate: () => (trimmed ? null : EMAIL_REQUIRED) },
    );
  }

  function resetPassword(email: string): Promise<boolean> {
    return runAuthAction(
      (client) =>
        client.auth.resetPasswordForEmail(email, {
          redirectTo: emailRedirectTo(),
        }),
      {
        onSuccess: () => {
          error.value = RESET_REQUESTED;
        },
      },
    );
  }

  /**
   * Zet een nieuw wachtwoord na een herstel-link. De sessie is op dat moment
   * al een recovery-sessie, dus dit is een gewone `updateUser`-call.
   */
  function updatePassword(newPassword: string): Promise<boolean> {
    return runAuthAction(
      (client) => client.auth.updateUser({ password: newPassword }),
      {
        validate: () => passwordLengthError(newPassword),
        onSuccess: () => setRecovery(false),
      },
    );
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
