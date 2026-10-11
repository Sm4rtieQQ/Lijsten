<script setup lang="ts">
import { reactive, ref } from "vue";

import { useAuth } from "../composables/useAuth";

const emit = defineEmits<{ register: [] }>();

const { error, configured, signIn, resetPassword } = useAuth();

const form = reactive({
  email: "",
  password: "",
  message: "",
});
const showPassword = ref(false);

async function onLogin() {
  form.message = "Bezig met inloggen…";
  const ok = await signIn(form.email.trim(), form.password);
  form.message = ok ? "" : (error.value ?? "Inloggen mislukt.");
}

async function onForgot() {
  if (!form.email.trim()) {
    form.message = "Vul eerst je e-mailadres in.";
    return;
  }
  await resetPassword(form.email.trim());
  // De tekst over de beperkte aflevering staat in `useAuth.resetPassword`, zodat
  // er één bron van waarheid is.
  form.message = error.value ?? "";
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
      </form>

      <button
        class="text-button forgot-password"
        type="button"
        @click="onForgot"
      >
        Wachtwoord vergeten?
      </button>

      <button
        class="button-secondary login-register"
        type="button"
        @click="emit('register')"
      >
        Registreren
      </button>
    </div>
  </section>
</template>
