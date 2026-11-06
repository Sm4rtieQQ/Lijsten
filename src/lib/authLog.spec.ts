import { beforeEach, describe, expect, it } from "vitest";

import {
  AUTH_LOG_KEY,
  AUTH_LOG_MAX,
  appendAuthLog,
  readAuthLog,
  type AuthLogEntry,
} from "./authLog";
import type { StorageBackend } from "./storage";

function memoryBackend(): StorageBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("authLog — ring buffer van auth-events", () => {
  let backend: ReturnType<typeof memoryBackend>;

  beforeEach(() => {
    backend = memoryBackend();
  });

  it("is leeg zolang er niets gelogd is", () => {
    expect(readAuthLog(backend)).toEqual([]);
  });

  it("bewaart eventnaam, ISO-tijdstip en of de gebruiker het zelf deed", () => {
    appendAuthLog(
      "SIGNED_OUT",
      false,
      backend,
      new Date("2026-11-06T10:00:00Z"),
    );
    appendAuthLog(
      "SIGNED_OUT",
      true,
      backend,
      new Date("2026-11-06T10:05:00Z"),
    );

    expect(readAuthLog(backend)).toEqual([
      {
        at: "2026-11-06T10:00:00.000Z",
        event: "SIGNED_OUT",
        userInitiated: false,
      },
      {
        at: "2026-11-06T10:05:00.000Z",
        event: "SIGNED_OUT",
        userInitiated: true,
      },
    ]);
  });

  it("houdt alleen de laatste AUTH_LOG_MAX entries (oudste vallen af)", () => {
    for (let i = 0; i < AUTH_LOG_MAX + 5; i += 1) {
      appendAuthLog(`EVENT_${i}`, false, backend);
    }
    const log = readAuthLog(backend);
    expect(log).toHaveLength(AUTH_LOG_MAX);
    expect(log[0]?.event).toBe("EVENT_5");
    expect(log.at(-1)?.event).toBe(`EVENT_${AUTH_LOG_MAX + 4}`);
  });

  it("bevat uitsluitend at/event/userInitiated: geen tokens, e-mail of id's", () => {
    appendAuthLog("SIGNED_IN", false, backend);
    const [entry] = readAuthLog(backend);
    expect(Object.keys(entry as AuthLogEntry).sort()).toEqual([
      "at",
      "event",
      "userInitiated",
    ]);
  });

  it("negeert een corrupte of vreemde inhoud en gaat gewoon door", () => {
    backend.setItem(AUTH_LOG_KEY, "{kapot");
    expect(readAuthLog(backend)).toEqual([]);
    backend.setItem(AUTH_LOG_KEY, JSON.stringify([{ foo: 1 }, "x"]));
    expect(readAuthLog(backend)).toEqual([]);

    appendAuthLog("SIGNED_IN", false, backend);
    expect(readAuthLog(backend)).toHaveLength(1);
  });

  it("faalt stil als de opslag weigert (logging mag de app niet breken)", () => {
    const broken: StorageBackend = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(() => appendAuthLog("SIGNED_OUT", false, broken)).not.toThrow();
  });
});
