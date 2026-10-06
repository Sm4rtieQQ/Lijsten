import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

// De composable importeert `supabase`; voor deze parser-tests is `null` genoeg
// (alleen de recovery-flow raakt de auth-client, en die testen we hier niet).
vi.mock("../lib/supabase", () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import {
  __resetDeepLinkState,
  handleIncomingUrl,
  useDeepLink,
} from "./useDeepLink";
import { extractInviteToken, scrubInviteToken } from "../lib/inviteToken";

type DeepLinkExposed = {
  inviteToken: { value: string | null };
  handleIncomingUrl: (url: string) => Promise<void>;
};

/** Mount een dummy-component zodat `useDeepLink()` zijn onBeforeUnmount kan registreren. */
function mountDeepLink(): DeepLinkExposed {
  const wrapper = mount({
    setup() {
      const dl = useDeepLink();
      return { dl };
    },
    template: "<div />",
  });
  const exposed = wrapper.vm as unknown as { dl: DeepLinkExposed };
  wrapper.unmount();
  return exposed.dl;
}

describe("useDeepLink / inviteToken (AGENTS.md §8.11)", () => {
  it("accepteert de native deep link com.lijstjes.app://invite?token=ABC", async () => {
    __resetDeepLinkState();
    await handleIncomingUrl("com.lijstjes.app://invite?token=ABC");
    expect(mountDeepLink().inviteToken.value).toBe("ABC");
  });

  it("accepteert de webvariant ?invite=ABC", async () => {
    __resetDeepLinkState();
    await handleIncomingUrl("http://localhost:5173/?invite=ABC");
    expect(mountDeepLink().inviteToken.value).toBe("ABC");
  });

  it("accepteert de hash-variant #invite=ABC", async () => {
    __resetDeepLinkState();
    await handleIncomingUrl("http://localhost:5173/#invite=ABC");
    expect(mountDeepLink().inviteToken.value).toBe("ABC");
  });

  it("geeft null terug bij een URL zonder token", async () => {
    __resetDeepLinkState();
    await handleIncomingUrl("http://localhost:5173/");
    expect(mountDeepLink().inviteToken.value).toBeNull();
  });

  it("haalt de token uit de resultaat-URL (scrub): nooit in URL/historie laten staan", () => {
    expect(scrubInviteToken("http://localhost:5173/?invite=ABC")).toBe(
      "http://localhost:5173/",
    );
    expect(scrubInviteToken("http://localhost:5173/#invite=ABC")).toBe(
      "http://localhost:5173/",
    );
    expect(scrubInviteToken("com.lijstjes.app://invite?token=ABC")).toBe(
      "com.lijstjes.app://invite",
    );
  });

  it("extractInviteToken vereist het invite-pad bij de native token-parameter", () => {
    // `token=` zonder het invite-pad is géén geldige uitnodiging.
    expect(extractInviteToken("com.lijstjes.app://other?token=ABC")).toBeNull();
    expect(extractInviteToken("com.lijstjes.app://invite?token=ABC")).toBe(
      "ABC",
    );
  });
});
