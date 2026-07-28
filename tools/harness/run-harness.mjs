import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
await esbuild.build({
  entryPoints: [path.join(here, 'harness-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(here, '.harness.cjs'),
  alias: { '@': path.join(root, 'src') },
  logLevel: 'silent',
});
const res = spawnSync('node', [path.join(here, '.harness.cjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);
