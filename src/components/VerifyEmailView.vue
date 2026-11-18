<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import AuthCard from "./AuthCard.vue";
import UiButton from "./ui/UiButton.vue";
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
  <AuthCard eyebrow="BEVESTIG JE E-MAIL">
    <p class="mb-6 leading-[1.5] text-muted">{{ notice }}</p>

    <p class="mt-[19px] text-[12px] leading-[1.5] text-muted">
      De mail kan even op zich laten wachten of in de spam belanden. Komt er
      niets aan? Vraag hieronder een nieuwe link aan.
    </p>

    <UiButton
      variant="secondary"
      block
      class="mt-[18px]"
      :disabled="busy || cooldown > 0"
      @click="onResend"
    >
      {{
        cooldown > 0
          ? `Opnieuw mogelijk over ${cooldown}s`
          : "Nieuwe verificatielink opvragen"
      }}
    </UiButton>

    <p
      data-testid="auth-message"
      role="status"
      aria-live="polite"
      class="min-h-[18px] text-[13px] text-accent"
    >
      {{ message }}
    </p>

    <UiButton
      variant="text"
      size="sm"
      class="-mt-1 justify-self-start"
      @click="emit('back')"
    >
      Terug naar inloggen
    </UiButton>
  </AuthCard>
</template>
