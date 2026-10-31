import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app.html'),
        native: resolve(import.meta.dirname, 'native.html'),
        proof: resolve(import.meta.dirname, 'proof.html'),
      },
    },
  },
});
