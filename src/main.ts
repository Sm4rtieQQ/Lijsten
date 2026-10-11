import { createApp } from "vue";

import App from "./App.vue";
import { registerServiceWorker } from "./pwa/register-sw";
import "./styles.css";

createApp(App).mount("#app");

// PWA: service worker alleen in de productiebuild (zie src/pwa/register-sw.ts).
registerServiceWorker();
