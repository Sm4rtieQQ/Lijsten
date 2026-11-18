<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from "vue";

import AuthCard from "./AuthCard.vue";
import UiButton from "./ui/UiButton.vue";
import UiField from "./ui/UiField.vue";
import UiInput from "./ui/UiInput.vue";
import PasswordInput from "./PasswordInput.vue";
import { useAuth } from "../composables/useAuth";
import { EMAIL_REQUIRED, validateNewPassword } from "../lib/validation";

const emit = defineEmits<{ cancel: [] }>();

const { error, register } = useAuth();

const form = reactive({
  email: "",
  password: "",
  repeat: "",
  message: "",
});

const emailInput = ref<InstanceType<typeof UiInput> | null>(null);
const busy = ref(false);

function validate(): string | null {
  if (!form.email.trim()) return EMAIL_REQUIRED;
  return validateNewPassword(form.password, form.repeat);
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
  <AuthCard eyebrow="ACCOUNT AANMAKEN">
    <form class="grid gap-[15px]" novalidate @submit.prevent="onSubmit">
      <UiField label="E-mailadres">
        <UiInput
          ref="emailInput"
          v-model.trim="form.email"
          type="email"
          autocomplete="email"
          aria-describedby="register-message"
          placeholder="jij@voorbeeld.nl"
        />
      </UiField>
      <UiField label="Wachtwoord">
        <PasswordInput
          v-model="form.password"
          toggle-name="wachtwoord"
          autocomplete="new-password"
          placeholder="Minimaal 6 tekens"
          aria-label="Wachtwoord"
        />
      </UiField>
      <UiField label="Wachtwoord herhalen">
        <PasswordInput
          v-model="form.repeat"
          toggle-name="wachtwoord herhalen"
          autocomplete="new-password"
          aria-label="Wachtwoord herhalen"
        />
      </UiField>
      <p
        id="register-message"
        data-testid="auth-message"
        role="status"
        aria-live="polite"
        class="min-h-[18px] text-[13px] text-accent"
      >
        {{ form.message }}
      </p>
      <UiButton type="submit" block class="mt-[25px]" :disabled="busy">
        Account aanmaken
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
