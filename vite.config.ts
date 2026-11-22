import { defineConfig } from 'vite';

// base './' keeps every asset path relative, so the build works on GitHub Pages
// under /<repo>/ as well as at a domain root.
export default defineConfig({
  base: './',
  // openings.json is a lazy chunk of ~680 KB (≈90 KB gzipped), loaded only when a review is built.
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
