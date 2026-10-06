<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import { useAuth } from "../composables/useAuth";

const emit = defineEmits<{ cancel: [] }>();

const { error, updatePassword } = useAuth();

const MIN_PASSWORD_LENGTH = 6;

const form = reactive({
  password: "",
  repeat: "",
  message: "",
  submit: "",
});

const showPassword = ref(false);
const firstInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);

function validate(): string | null {
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
  form.message = "Wachtwoord wordt opgeslagen…";

  const ok = await updatePassword(form.password);
  busy.value = false;

  if (ok) {
    // De recovery-sessie is nu een gewone login; `App.vue` schakelt vanzelf
    // naar het overzicht omdat er een `user` is.
    form.message = "";
    return;
  }
  form.message = error.value ?? "Het wachtwoord kon niet worden opgeslagen.";
}

onMounted(async () => {
  await nextTick();
  firstInput.value?.focus();
});
</script>

<template>
  <section class="view active">
    <div class="login-card">
      <div class="login-title">
        <div>
          <p class="eyebrow">NIEUW WACHTWOORD</p>
          <h1>Lijstjes</h1>
        </div>
        <div class="app-mark">&#10003;</div>
      </div>

      <form class="login-form" novalidate @submit.prevent="onSubmit">
        <label>
          Nieuw wachtwoord
          <span class="password-field">
            <input
              ref="firstInput"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              minlength="6"
              placeholder="Minimaal 6 tekens"
              aria-label="Nieuw wachtwoord"
              aria-describedby="reset-message"
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
        <p id="reset-message" class="login-message" aria-live="polite">
          {{ form.message }}
        </p>
        <button class="dialog-submit" type="submit" :disabled="busy">
          {{ form.submit || "Wachtwoord opslaan" }}
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
