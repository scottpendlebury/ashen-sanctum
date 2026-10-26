import { defineConfig } from 'vite';

// base './' so asset URLs are relative and work under the GitHub Pages
// repository subpath (e.g. /ashen-sanctum/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    assetsInlineLimit: 4096,
  },
});
