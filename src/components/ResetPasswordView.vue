<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import AuthCard from "./AuthCard.vue";
import UiButton from "./ui/UiButton.vue";
import UiField from "./ui/UiField.vue";
import UiInput from "./ui/UiInput.vue";
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
    <form class="grid gap-[15px]" novalidate @submit.prevent="onSubmit">
      <UiField label="Nieuw wachtwoord">
        <PasswordInput
          ref="firstInput"
          v-model="form.password"
          toggle-name="wachtwoord"
          autocomplete="new-password"
          placeholder="Minimaal 6 tekens"
          aria-label="Nieuw wachtwoord"
          aria-describedby="reset-message"
        />
      </UiField>
      <UiField label="Wachtwoord herhalen">
        <UiInput
          v-model="form.repeat"
          type="password"
          autocomplete="new-password"
          minlength="6"
          aria-label="Wachtwoord herhalen"
        />
      </UiField>
      <p
        id="reset-message"
        data-testid="auth-message"
        role="status"
        aria-live="polite"
        class="min-h-[18px] text-[13px] text-accent"
      >
        {{ form.message }}
      </p>
      <UiButton type="submit" block class="mt-[25px]" :disabled="busy">
        Wachtwoord opslaan
        <template #trailing>&#8594;</template>
      </UiButton>
    </form>

    <UiButton
      variant="text"
      size="sm"
      class="-mt-1 justify-self-start"
      @click="emit('cancel')"
    >
      Terug naar inloggen
    </UiButton>
  </AuthCard>
</template>
