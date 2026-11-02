import { describe, expect, it } from "vitest";

import {
  PASSWORD_REQUIRED,
  PASSWORD_TOO_SHORT,
  PASSWORDS_DIFFER,
  passwordLengthError,
  validateNewPassword,
} from "./validation";

describe("validation — wachtwoordregels", () => {
  it("passwordLengthError: < 6 tekens is te kort, 6 is genoeg", () => {
    expect(passwordLengthError("12345")).toBe(PASSWORD_TOO_SHORT);
    expect(passwordLengthError("123456")).toBeNull();
  });

  it("validateNewPassword: leeg, te kort, verschillend, geldig", () => {
    expect(validateNewPassword("", "")).toBe(PASSWORD_REQUIRED);
    expect(validateNewPassword("abc", "abc")).toBe(PASSWORD_TOO_SHORT);
    expect(validateNewPassword("geheim1", "geheim2")).toBe(PASSWORDS_DIFFER);
    expect(validateNewPassword("geheim1", "geheim1")).toBeNull();
  });
});
