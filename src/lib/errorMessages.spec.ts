import { describe, expect, it } from "vitest";

import {
  ACCESS_DENIED,
  AUTH_GENERIC_ERROR,
  CONNECTION_DROPPED,
  DUPLICATE_ERROR,
  EMAIL_NOT_CONFIRMED,
  isEmailNotConfirmed,
  NETWORK_ERROR,
  SYNC_GENERIC_ERROR,
  toAuthErrorMessage,
  toUserFacingError,
} from "./errorMessages";

describe("toUserFacingError (sync-laag, AGENTS.md §7.5)", () => {
  it("mapt een TypeError direct op de netwerkfout, ook met technische tekst", () => {
    const err = new TypeError(
      "Failed to fetch: connection refused at 10.0.0.1",
    );
    expect(toUserFacingError(err)).toBe(NETWORK_ERROR);
  });

  it("herkent 'Failed to fetch'-achtige teksten en mapt op de netwerkfout", () => {
    expect(toUserFacingError("TypeError: Failed to fetch")).toBe(NETWORK_ERROR);
    expect(
      toUserFacingError("NetworkError when attempting to fetch resource."),
    ).toBe(NETWORK_ERROR);
  });

  it("mapt abort/timeout op de afgebroken verbinding", () => {
    expect(toUserFacingError("The request was aborted")).toBe(
      CONNECTION_DROPPED,
    );
    expect(toUserFacingError("timeout of 10000ms exceeded")).toBe(
      CONNECTION_DROPPED,
    );
  });

  it("mapt RLS/permissiefouten op de toegangstekst", () => {
    expect(
      toUserFacingError("new row violates row-level security policy"),
    ).toBe(ACCESS_DENIED);
    expect(toUserFacingError("permission denied for table lists")).toBe(
      ACCESS_DENIED,
    );
  });

  it("mapt duplicaat/unique-constraint op de duplicaattekst", () => {
    expect(
      toUserFacingError("duplicate key value violates unique constraint"),
    ).toBe(DUPLICATE_ERROR);
    expect(toUserFacingError('{"code":"23505"}')).toBe(DUPLICATE_ERROR);
  });

  it("valt voor onbekende fouten terug op de generieke NL-tekst", () => {
    expect(toUserFacingError("some unknown database error 4242")).toBe(
      SYNC_GENERIC_ERROR,
    );
  });

  it("lekt nooit de ruwe melding van een onbekend object", () => {
    const raw = { message: "CRYPTIC INTERNAL ERROR: index out of bounds" };
    expect(toUserFacingError(raw)).toBe(SYNC_GENERIC_ERROR);
  });

  it("behandelt null/undefined/leeg alsof er niets bruikbaars is", () => {
    expect(toUserFacingError(null)).toBe(SYNC_GENERIC_ERROR);
    expect(toUserFacingError(undefined)).toBe(SYNC_GENERIC_ERROR);
    expect(toUserFacingError("")).toBe(SYNC_GENERIC_ERROR);
  });

  it("mapt een object met Supabase-velden (message/code)", () => {
    const err = {
      code: "23505",
      message: "duplicate key value",
      error_description: "",
    };
    expect(toUserFacingError(err)).toBe(DUPLICATE_ERROR);
  });
});

describe("toAuthErrorMessage (auth-laag, AGENTS.md §7.6)", () => {
  it("vertaalt 'email not confirmed' naar de verificatietekst", () => {
    expect(toAuthErrorMessage("Email not confirmed")).toBe(EMAIL_NOT_CONFIRMED);
    expect(
      toAuthErrorMessage({
        message: "Email not confirmed",
        code: "email_not_confirmed",
      }),
    ).toBe(EMAIL_NOT_CONFIRMED);
  });

  it("herkent de onbevestigde-status ook los (isEmailNotConfirmed)", () => {
    expect(isEmailNotConfirmed({ code: "email_not_confirmed" })).toBe(true);
    expect(
      isEmailNotConfirmed({ message: "Email not confirmed", code: "" }),
    ).toBe(true);
    expect(isEmailNotConfirmed("Invalid login credentials")).toBe(false);
  });

  it("vertaalt 'invalid login credentials' naar de inlogtekst", () => {
    expect(toAuthErrorMessage("Invalid login credentials")).toBe(
      "De inloggegevens zijn onjuist.",
    );
  });

  it("vertaalt 'user already registered' naar de bestaand-accounttekst", () => {
    expect(toAuthErrorMessage("User already registered")).toBe(
      "Er bestaat al een account met dit e-mailadres.",
    );
  });

  it("vertaalt de rate limit naar een vriendelijke NL-tekst", () => {
    expect(toAuthErrorMessage("Email rate limit exceeded")).toBe(
      "Er zijn te veel verzoeken verstuurd. Probeer het later opnieuw.",
    );
  });

  it("vertaalt het wachtwoordbeleid naar de min-length tekst", () => {
    expect(
      toAuthErrorMessage("Password should be at least 6 characters."),
    ).toBe("Kies een wachtwoord van minimaal 6 tekens.");
  });

  it("herkent ook netwerkfouten in de auth-laag", () => {
    expect(toAuthErrorMessage(new TypeError("Failed to fetch"))).toBe(
      NETWORK_ERROR,
    );
  });

  it("valt terug op de generieke auth-tekst voor onbekende fouten", () => {
    expect(toAuthErrorMessage("maximum calls reached on function")).toBe(
      AUTH_GENERIC_ERROR,
    );
  });
});
