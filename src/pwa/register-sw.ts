// Registratie van de service worker (PWA, zie AGENTS.md §8.12).
//
// Bewust voorzichtig:
// - Niet in development: de Vite-devserver heeft geen zinvolle SW en het zou
//   hot-reload in de weg zitten.
// - Niet in de Capacitor-app: de native WebView heeft de SW-extras niet nodig
//   (de app is al geïnstalleerd) en caching daar kan verwarren.
// - Een mislukte registratie mag nooit de app breken: fouten worden genegeerd.

/** Pure beslisregel, los te testen. */
export function shouldRegisterServiceWorker(options: {
  hasServiceWorker: boolean;
  isDev: boolean;
  isNative: boolean;
}): boolean {
  return options.hasServiceWorker && !options.isDev && !options.isNative;
}

function isNativePlatform(): boolean {
  const cap = (
    globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** Registreert `./sw.js` zodra de pagina geladen is. Faalt stil. */
export function registerServiceWorker(): void {
  const allowed = shouldRegisterServiceWorker({
    hasServiceWorker:
      typeof navigator !== "undefined" && "serviceWorker" in navigator,
    isDev: import.meta.env.DEV,
    isNative: isNativePlatform(),
  });

  if (!allowed) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Extras zijn optioneel; een mislukte registratie mag nooit de app breken.
    });
  });
}
