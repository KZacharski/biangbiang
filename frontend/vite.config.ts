import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';

// The backend runs on :8080 by default. During `vite dev` we proxy the API and
// the mirrored files to it so the SPA can be developed against live data.
const backend = process.env.BACKEND_ORIGIN || 'http://localhost:8080';

// Expose this package's version to the app (used by the footer credit).
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    Components({
      dts: 'src/components.d.ts',
      resolvers: [
        AntDesignVueResolver({
          // ant-design-vue v4 ships styles via CSS-in-JS.
          importStyle: false,
        }),
      ],
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/dl': { target: backend, changeOrigin: true },
      '/media': { target: backend, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
