import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // F-35: HMR used to be switched off unconditionally, because a sandboxed preview
      // environment had no working HMR socket and the resulting console noise looked like an
      // application fault. That is the wrong trade: it removed hot reload from every developer's
      // machine to hide a problem that only exists in a preview iframe.
      //
      // HMR is now on by default and can be disabled per environment. Production is unaffected
      // either way - `server` applies only to the dev server, and the deployed bundle is static
      // and served by the Node/Vercel server, so no HMR client is shipped to callers.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
