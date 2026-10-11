<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import { useAuth } from "../composables/useAuth";

const emit = defineEmits<{ cancel: [] }>();

const { error, register } = useAuth();

const MIN_PASSWORD_LENGTH = 6;

const form = reactive({
  email: "",
  password: "",
  repeat: "",
  message: "",
});

const showPassword = ref(false);
const showRepeat = ref(false);
const emailInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);

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

  const ok = await register(form.email, form.password);
  busy.value = false;

  if (ok) {
    // `register` zet `verificationEmail`; App.vue toont dan de verificatiepagina.
    form.message = "";
    return;
  }
  form.message = error.value ?? "Het account kon niet worden aangemaakt.";
}

onMounted(async () => {
  await nextTick();
  emailInput.value?.focus();
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
          <span class="password-field">
            <input
              v-model="form.repeat"
              :type="showRepeat ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="6"
              aria-label="Wachtwoord herhalen"
            />
            <button
              class="toggle-password-button"
              type="button"
              :aria-label="
                showRepeat
                  ? 'Wachtwoord herhalen verbergen'
                  : 'Toon wachtwoord herhalen'
              "
              @click="showRepeat = !showRepeat"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </span>
        </label>
        <p id="register-message" class="login-message" aria-live="polite">
          {{ form.message }}
        </p>
        <button class="dialog-submit" type="submit" :disabled="busy">
          Account aanmaken
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
