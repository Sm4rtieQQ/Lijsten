<script setup lang="ts">
import { reactive } from "vue";

import AuthCard from "./AuthCard.vue";
import UiButton from "./ui/UiButton.vue";
import PasswordInput from "./PasswordInput.vue";
import { useAuth } from "../composables/useAuth";

const emit = defineEmits<{ register: [] }>();

const { error, configured, signIn, resetPassword } = useAuth();

const form = reactive({
  email: "",
  password: "",
  message: "",
});

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
  <AuthCard eyebrow="WELKOM BIJ">
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
        <PasswordInput
          v-model="form.password"
          toggle-name="wachtwoord"
          autocomplete="current-password"
          placeholder="Minimaal 6 tekens"
          aria-label="Wachtwoord"
        />
      </label>
      <p class="login-message" aria-live="polite">{{ form.message }}</p>
      <UiButton type="submit" block class="mt-[25px]">
        Inloggen
        <template #trailing>&#8594;</template>
      </UiButton>
    </form>

    <UiButton
      variant="text"
      size="sm"
      class="-mt-1 justify-self-start"
      @click="onForgot"
    >
      Wachtwoord vergeten?
    </UiButton>

    <UiButton variant="secondary" block class="mt-3" @click="emit('register')">
      Registreren
    </UiButton>
  </AuthCard>
</template>
