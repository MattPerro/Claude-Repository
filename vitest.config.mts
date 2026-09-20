import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Solo i pacchetti di dominio/persistenza/sincronizzazione: sono TS puro
    // e girano su Node. L'app mobile ha una sua catena di verifica (vedi
    // QA_REPORT.md) e non viene inclusa qui per non far passare per
    // "testato" cio' che non e' stato eseguito.
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/index.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
  resolve: {
    alias: {
      '@trackstrong/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@trackstrong/db/node': new URL('./packages/db/src/node.ts', import.meta.url).pathname,
      '@trackstrong/db': new URL('./packages/db/src/index.ts', import.meta.url).pathname,
      '@trackstrong/sync': new URL('./packages/sync/src/index.ts', import.meta.url).pathname,
    },
  },
});
