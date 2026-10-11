import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const { mockSetSession } = vi.hoisted(() => ({ mockSetSession: vi.fn() }));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: { setSession: mockSetSession } },
  isSupabaseConfigured: true,
}));

import {
  __resetDeepLinkState,
  handleIncomingUrl,
  useDeepLink,
} from "./useDeepLink";
import { useAuth } from "./useAuth";
import {
  isRecoveryUrl,
  isSignupConfirmationUrl,
  readParams,
  stripUrlHash,
} from "../lib/urlParams";

const AUTH = useAuth();

const SIGNUP_URL =
  "com.lijstjes.app://#access_token=abc&refresh_token=def&type=signup";
const RECOVERY_URL =
  "com.lijstjes.app://#access_token=abc&refresh_token=def&type=recovery";

describe("urlParams — pure URL-parser (AGENTS.md §8.11)", () => {
  it("leest query- én hash-parameters, ook bij een custom scheme", () => {
    const params = readParams(SIGNUP_URL);
    expect(params.get("access_token")).toBe("abc");
    expect(params.get("refresh_token")).toBe("def");
    expect(params.get("type")).toBe("signup");
  });

  it("herkent de herstel-link aan type=recovery", () => {
    expect(isRecoveryUrl(RECOVERY_URL)).toBe(true);
    expect(isRecoveryUrl(SIGNUP_URL)).toBe(false);
  });

  it("herkent de bevestigingslink alleen met type=signup én tokenpaar", () => {
    expect(isSignupConfirmationUrl(SIGNUP_URL)).toBe(true);
    // Zonder tokenpaar is het geen bruikbare bevestigingslink.
    expect(isSignupConfirmationUrl("http://localhost:5173/#type=signup")).toBe(
      false,
    );
    // Een herstel-link mag nooit als bevestiging doorgaan.
    expect(isSignupConfirmationUrl(RECOVERY_URL)).toBe(false);
  });

  it("haalt de hash (met tokens) uit de URL", () => {
    expect(stripUrlHash("http://localhost:5173/#access_token=abc")).toBe(
      "http://localhost:5173/",
    );
    expect(stripUrlHash("http://localhost:5173/?a=1#access_token=abc")).toBe(
      "http://localhost:5173/?a=1",
    );
    expect(stripUrlHash("http://localhost:5173/")).toBe(
      "http://localhost:5173/",
    );
  });
});

describe("useDeepLink.handleIncomingUrl (AGENTS.md §8.11)", () => {
  beforeEach(() => {
    mockSetSession.mockReset();
    __resetDeepLinkState();
  });

  it("zet een sessie en markeert recovery bij een herstel-link", async () => {
    mockSetSession.mockResolvedValue({ error: null });

    await handleIncomingUrl(RECOVERY_URL);

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "abc",
      refresh_token: "def",
    });
    expect(AUTH.recovery.value).toBe(true);
    expect(AUTH.justVerified.value).toBe(false);
  });

  it("zet een sessie en markeert de bevestiging bij een signup-link", async () => {
    mockSetSession.mockResolvedValue({ error: null });

    await handleIncomingUrl(SIGNUP_URL);

    expect(AUTH.justVerified.value).toBe(true);
    // Een bevestigingslink mag NIET naar de herstelweergave leiden.
    expect(AUTH.recovery.value).toBe(false);
  });

  it("doet niets bij een gewone URL", async () => {
    await handleIncomingUrl("http://localhost:5173/");

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(AUTH.recovery.value).toBe(false);
    expect(AUTH.justVerified.value).toBe(false);
  });

  it("doet niets als het tokenpaar ontbreekt", async () => {
    await handleIncomingUrl("com.lijstjes.app://#type=signup");

    expect(mockSetSession).not.toHaveBeenCalled();
    expect(AUTH.justVerified.value).toBe(false);
  });

  it("negeert een fout van setSession (geen vlag, geen crash)", async () => {
    mockSetSession.mockResolvedValue({ error: { message: "invalid" } });

    await handleIncomingUrl(SIGNUP_URL);

    expect(AUTH.justVerified.value).toBe(false);
  });

  it("kan in een component worden gebruikt en ruimt bij unmount op", () => {
    const wrapper = mount({
      setup() {
        return { dl: useDeepLink() };
      },
      template: "<div />",
    });
    const exposed = wrapper.vm as unknown as {
      dl: { handleIncomingUrl: (url: string) => Promise<void> };
    };
    expect(typeof exposed.dl.handleIncomingUrl).toBe("function");
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
