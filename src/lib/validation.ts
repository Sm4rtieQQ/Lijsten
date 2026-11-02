/**
 * Formuliervalidatie voor registratie en nieuw wachtwoord. Eén bron van
 * waarheid voor `useAuth`, `RegisterView` en `ResetPasswordView`.
 */

/** Minimumlengte van het wachtwoord; hetzelfde beleid als Supabase hanteert. */
export const MIN_PASSWORD_LENGTH = 6;

export const EMAIL_REQUIRED = "Vul je e-mailadres in.";
export const PASSWORD_REQUIRED = "Kies een wachtwoord.";
export const PASSWORD_TOO_SHORT = `Het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens hebben.`;
export const PASSWORDS_DIFFER = "De wachtwoorden verschillen.";

/** Foutmelding als het wachtwoord te kort is, anders `null`. */
export function passwordLengthError(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? PASSWORD_TOO_SHORT : null;
}

/** Valideert een nieuw wachtwoord plus herhaling. `null` = geldig. */
export function validateNewPassword(
  password: string,
  repeat: string,
): string | null {
  if (!password) return PASSWORD_REQUIRED;
  const tooShort = passwordLengthError(password);
  if (tooShort) return tooShort;
  if (password !== repeat) return PASSWORDS_DIFFER;
  return null;
}
