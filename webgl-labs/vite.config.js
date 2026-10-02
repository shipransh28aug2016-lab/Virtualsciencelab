import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /* three is large and stable; splitting it keeps the app chunk small enough to
     hot-reload instantly on a school laptop. */
  build: { rollupOptions: { output: { manualChunks: { three: ['three'] } } } },
});
