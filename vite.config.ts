import { defineConfig, type Plugin } from "vite";
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * citation-js's core imports node-fetch/sync-fetch for remote DOI/URL lookups.
 * The editor only parses local files, and those packages break in the browser
 * (they pull Node builtins), so replace the module with the browser-native
 * fetch. The remote-fetching functions are never called by the editor.
 */
const citationFetchPatch: Plugin = {
  name: 'citation-fetch-patch',
  enforce: 'pre',
  transform(code, id) {
    if (id.includes('@citation-js/core') && id.endsWith('/util/fetchFile.js')) {
      return code
        .replace(
          "import syncFetch from 'sync-fetch';",
          "const syncFetch = Object.assign(() => { throw new Error('sync-fetch is not available in the browser'); }, { Headers: globalThis.Headers });"
        )
        .replace(
          "import nodeFetch, { Headers as nodeFetchHeaders } from 'node-fetch';",
          "const nodeFetch = globalThis.fetch; const nodeFetchHeaders = globalThis.Headers;"
        );
    }
    return null;
  }
};

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  optimizeDeps: {
    // Apply the fetch patch while pre-bundling citation-js (its ESM sources
    // rely on circular imports that must be resolved by the optimizer).
    rolldownOptions: {
      plugins: [citationFetchPatch],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
      },
    },
  },
  plugins: [
    citationFetchPatch,
    tailwindcss()
  ],
}));
