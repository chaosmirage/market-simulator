/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/market-simulator',
  plugins: [angular(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    watch: false,
    globals: true,
    // Fork processes instead of worker threads: the Angular test setup loads
    // zone.js, which patches MessagePort — the same port vitest's threads-pool
    // RPC rides on. When a transform-cold runner slows that RPC past its
    // timeout, the patched port turns one hang into a hundreds-of-thousands
    // uncaught-exception storm (proven on CI). Process IPC leaves vitest's
    // transport outside zone.js's reach.
    pool: 'forks' as const,
    poolOptions: { forks: { execArgv: [] } },
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/market-simulator',
      provider: 'v8' as const,
    },
  },
}));
