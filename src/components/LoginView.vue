<script setup lang="ts">
import { reactive, ref } from "vue";

import { useAuth } from "../composables/useAuth";

const { error, configured, signIn, signUp, resetPassword } = useAuth();

const form = reactive({
  email: "",
  password: "",
  message: "",
  submit: "",
});
const showPassword = ref(false);

async function onLogin() {
  form.message = "Bezig met inloggen…";
  const ok = await signIn(form.email.trim(), form.password);
  if (!ok) form.message = error.value ?? "Inloggen mislukt.";
  else form.message = "";
}

async function onSignUp() {
  form.message = "Account wordt aangemaakt…";
  const ok = await signUp(form.email.trim(), form.password);
  if (!ok) form.message = error.value ?? "";
  else form.message = "";
}

async function onForgot() {
  if (!form.email.trim()) {
    form.message = "Vul eerst je e-mailadres in.";
    return;
  }
  const ok = await resetPassword(form.email.trim());
  form.message = ok ? (error.value ?? "") : (error.value ?? "");
}
</script>

<template>
  <section class="view active">
    <div class="login-card">
      <div class="login-title">
        <div>
          <p class="eyebrow">WELKOM BIJ</p>
          <h1>Lijstjes</h1>
        </div>
        <div class="app-mark">&#10003;</div>
      </div>

      <p v-if="!configured" class="login-note">
        Supabase is niet geconfigureerd. Vul <code>.env</code> in (<code
          >VITE_SUPABASE_URL</code
        >
        en <code>VITE_SUPABASE_ANON_KEY</code>).
      </p>

      <form class="login-form" novalidate @submit.prevent="onLogin">
        <label>
          E-mailadres
          <input
            v-model.trim="form.email"
            type="email"
            autocomplete="email"
            placeholder="jij@voorbeeld.nl"
          />
        </label>
        <label>
          Wachtwoord
          <span class="password-field">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
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
        <p class="login-message" aria-live="polite">{{ form.message }}</p>
        <button class="dialog-submit" type="submit">
          Inloggen <span>&#8594;</span>
        </button>
        <button class="secondary-button" type="button" @click="onSignUp">
          Registreren
        </button>
      </form>

      <button
        class="text-button forgot-password"
        type="button"
        @click="onForgot"
      >
        Wachtwoord vergeten?
      </button>
      <p class="login-note">
        Een nieuw account vereist mogelijk bevestiging via e-mail.
      </p>
    </div>
  </section>
</template>
