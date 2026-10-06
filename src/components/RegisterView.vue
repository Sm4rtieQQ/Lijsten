<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import { useAuth } from "../composables/useAuth";
import { useDeepLink } from "../composables/useDeepLink";
import { supabase } from "../lib/supabase";

const emit = defineEmits<{ cancel: [] }>();

const { error, acceptInvite } = useAuth();
const { inviteToken } = useDeepLink();

const MIN_PASSWORD_LENGTH = 6;

const form = reactive({
  email: "",
  password: "",
  repeat: "",
  message: "",
  submit: "",
});

const showPassword = ref(false);
const emailInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
/** Zodra het adres uit de uitnodiging bekend is, is het veld niet meer te wijzigen. */
const emailLocked = ref(false);

/** E-mailadres uit de uitnodiging ophalen zodat het veld vooringevuld is. */
async function fetchInvitedEmail(token: string | null): Promise<void> {
  if (!token) {
    form.message =
      "Deze link is niet (meer) geldig. Vraag een nieuwe uitnodiging.";
    return;
  }

  form.submit = "Uitnodiging controleren…";
  const email = await lookupInviteEmail(token);
  form.submit = "";

  if (!email) {
    form.message = "Deze uitnodiging is ongeldig of verlopen.";
    return;
  }

  form.email = email;
  emailLocked.value = true;
  await nextTick();
  emailInput.value?.focus();
}

async function lookupInviteEmail(token: string): Promise<string | null> {
  if (!supabase) return null;

  try {
    const { data, error: err } = await supabase.rpc("claim_invite", {
      in_token: token,
    });
    if (err || !data?.valid) return null;
    return data.email ?? null;
  } catch {
    // Geen stack trace tonen; de melding hierboven volstaat.
    return null;
  }
}

function validate(): string | null {
  if (!form.email.trim()) return "Vul je e-mailadres in.";
  if (!form.password) return "Kies een wachtwoord.";
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens hebben.`;
  }
  if (form.password !== form.repeat) return "De wachtwoorden verschillen.";
  return null;
}

async function onSubmit() {
  if (busy.value) return;

  const invalid = validate();
  if (invalid) {
    form.message = invalid;
    return;
  }

  busy.value = true;
  form.message = "Account wordt aangemaakt…";

  const token = inviteToken.value;
  if (!token) {
    busy.value = false;
    form.message = "Deze uitnodiging is ongeldig of verlopen.";
    return;
  }

  const ok = await acceptInvite(form.email, form.password, token);
  busy.value = false;
  form.message = ok ? (error.value ?? "") : (error.value ?? "");
}

// Bij het openen: het adres uit de uitnodiging ophalen en het eerste veld focussen.
onMounted(() => {
  void fetchInvitedEmail(inviteToken.value);
});
</script>

<template>
  <section class="view active">
    <div class="login-card">
      <div class="login-title">
        <div>
          <p class="eyebrow">ACCOUNT AANMAKEN</p>
          <h1>Lijstjes</h1>
        </div>
        <div class="app-mark">&#10003;</div>
      </div>

      <form class="login-form" novalidate @submit.prevent="onSubmit">
        <label>
          E-mailadres
          <input
            ref="emailInput"
            v-model.trim="form.email"
            type="email"
            autocomplete="email"
            :readonly="emailLocked"
            aria-describedby="register-message"
            placeholder="jij@voorbeeld.nl"
          />
        </label>
        <label>
          Wachtwoord
          <span class="password-field">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="6"
              placeholder="Minimaal 6 tekens"
              aria-label="Wachtwoord"
            />
            <button
              class="toggle-password-button"
              type="button"
              :aria-label="
                showPassword ? 'Wachtwoord verbergen' : 'Toon wachtwoord'
              "
              @click="showPassword = !showPassword"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </span>
        </label>
        <label>
          Wachtwoord herhalen
          <input
            v-model="form.repeat"
            type="password"
            autocomplete="new-password"
            minlength="6"
            aria-label="Wachtwoord herhalen"
          />
        </label>
        <p id="register-message" class="login-message" aria-live="polite">
          {{ form.message }}
        </p>
        <button class="dialog-submit" type="submit" :disabled="busy">
          {{ form.submit || "Account aanmaken" }}
          <span>&#8594;</span>
        </button>
      </form>

      <button
        class="text-button forgot-password"
        type="button"
        @click="emit('cancel')"
      >
        Terug naar inloggen
      </button>
    </div>
  </section>
</template>
