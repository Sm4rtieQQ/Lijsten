<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";
import { useAuth } from "../composables/useAuth";
import { validateNewPassword } from "../lib/validation";

const emit = defineEmits<{ cancel: [] }>();

const { error, updatePassword } = useAuth();

const form = reactive({
  password: "",
  repeat: "",
  message: "",
});

const firstInput = ref<InstanceType<typeof PasswordInput> | null>(null);
const busy = ref(false);

async function onSubmit() {
  if (busy.value) return;

  const invalid = validateNewPassword(form.password, form.repeat);
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
  <AuthCard eyebrow="NIEUW WACHTWOORD">
    <form class="login-form" novalidate @submit.prevent="onSubmit">
      <label>
        Nieuw wachtwoord
        <PasswordInput
          ref="firstInput"
          v-model="form.password"
          toggle-name="wachtwoord"
          autocomplete="new-password"
          placeholder="Minimaal 6 tekens"
          aria-label="Nieuw wachtwoord"
          aria-describedby="reset-message"
        />
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
        Wachtwoord opslaan
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
  </AuthCard>
</template>
