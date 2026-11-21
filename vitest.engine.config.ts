import { defineConfig } from 'vitest/config';

// Integration tests that run the real Stockfish WASM engine in Node.
export default defineConfig({
  test: {
    include: ['tests/engine/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
