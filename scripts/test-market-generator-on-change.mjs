import { spawnSync } from 'node:child_process';

const artifactSpec =
  'apps/market-simulator/src/app/wasm/market-generator.artifact.spec.ts';
const changedFiles = (process.env.NX_FILE_CHANGES ?? '')
  .split(/\s+/)
  .filter(Boolean);
const shouldRun =
  changedFiles.some((file) => file.startsWith('libs/market-generator/')) ||
  changedFiles.includes(artifactSpec);

if (shouldRun) {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'nx',
      'test',
      'market-simulator',
      '--testFile=src/app/wasm/market-generator.artifact.spec.ts',
    ],
    { stdio: 'inherit' }
  );

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}
