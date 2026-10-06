/// <reference types="vitest/config" />

import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// `base: "./"` zorgt voor relatieve paden in de build. Nodig voor de Capacitor
// Android WebView, die de app op een eigen origin serveert.
export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  // Vitest (fase G): jsdom-omgeving; de spec-bestanden staan naast de code.
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts"],
    restoreMocks: true,
  },
});
