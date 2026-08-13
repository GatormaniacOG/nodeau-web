// defineConfig from vitest/config, not vite: the `test` block is Vitest's and
// vite's own type does not know it.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The hosted account application.
//
// Deployed to Netlify as a SECOND site from this repository, with `app` as the
// build base — the marketing site at the repository root is untouched and keeps
// its no-build deployment (docs/phase-07/netlify-deployment.md).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Fail the build rather than ship an unexpectedly large bundle. This app is
    // React plus about a thousand lines; anything approaching this limit means
    // a dependency arrived that nobody decided to add.
    chunkSizeWarningLimit: 400,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
