<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import { useAuth } from "../composables/useAuth";

const emit = defineEmits<{ back: [] }>();

const { error, verificationEmail, resendVerification } = useAuth();

/** Cooldown tussen twee resend-verzoeken; Supabase limiteert toch al hard. */
const RESEND_COOLDOWN_S = 60;

const busy = ref(false);
const message = ref("");
const cooldown = ref(0);
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const email = computed(() => verificationEmail.value ?? "");

/**
 * Exacte instructietekst (AGENTS.md §7.6). Eén string, zodat de zin gegarandeerd
 * aaneengesloten is en niet door template-whitespace wordt opgebroken.
 */
const notice = computed(
  () =>
    `Er is een email verzonden naar ${email.value}. Klik op de link in de mail om uw account te accepteren.`,
);

function stopCooldown(): void {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  cooldown.value = 0;
}

function startCooldown(): void {
  cooldown.value = RESEND_COOLDOWN_S;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1;
    if (cooldown.value <= 0) stopCooldown();
  }, 1000);
}

async function onResend(): Promise<void> {
  if (busy.value || cooldown.value > 0) return;

  busy.value = true;
  message.value = "Bezig met versturen…";

  const ok = await resendVerification(email.value);
  busy.value = false;

  if (ok) {
    message.value = "Er is een nieuwe verificatielink verstuurd.";
    startCooldown();
    return;
  }
  message.value = error.value ?? "Het versturen is niet gelukt.";
}

onBeforeUnmount(stopCooldown);
</script>

<template>
  <section class="view active">
    <div class="login-card">
      <div class="login-title">
        <div>
          <p class="eyebrow">BEVESTIG JE E-MAIL</p>
          <h1>Lijstjes</h1>
        </div>
        <div class="app-mark">&#10003;</div>
      </div>

      <p class="login-copy">{{ notice }}</p>

      <p class="login-note">
        De mail kan even op zich laten wachten of in de spam belanden. Komt er
        niets aan? Vraag hieronder een nieuwe link aan.
      </p>

      <button
        class="button-secondary verify-resend"
        type="button"
        :disabled="busy || cooldown > 0"
        @click="onResend"
      >
        {{
          cooldown > 0
            ? `Opnieuw mogelijk over ${cooldown}s`
            : "Nieuwe verificatielink opvragen"
        }}
      </button>

      <p class="login-message" aria-live="polite">{{ message }}</p>

      <button
        class="text-button forgot-password"
        type="button"
        @click="emit('back')"
      >
        Terug naar inloggen
      </button>
    </div>
  </section>
</template>
