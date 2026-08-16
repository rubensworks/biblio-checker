import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base, so the app also works from a GitHub Pages project subpath
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
