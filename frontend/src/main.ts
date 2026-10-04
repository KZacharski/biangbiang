import { createApp } from 'vue';

import App from './App.vue';
import 'ant-design-vue/dist/reset.css';
import './styles.css';

createApp(App).mount('#app');

// The service worker only exists to make the app installable as a PWA.
// It performs no caching, so there is no offline functionality by design.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installation support is best-effort */
    });
  });
}
