import { defineConfig } from 'vite';

// base './' keeps every asset path relative, so the build works on GitHub Pages
// under /<repo>/ as well as at a domain root.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
