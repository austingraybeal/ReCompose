// esbuild is intentionally NOT in the app's package.json: the deploy
// installs with pnpm --frozen-lockfile, and a harness-only dependency
// there breaks production builds. Self-install into tools/harness.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const req = createRequire(path.join(here, 'noop.js'));
let esbuild;
try {
  esbuild = req(req.resolve('esbuild', { paths: [here, root] }));
} catch {
  console.error('[harness] installing esbuild locally (one-time)...');
  const r = spawnSync('npm', ['install', '--no-save', '--prefix', here, 'esbuild@^0.25'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  esbuild = req(path.join(here, 'node_modules', 'esbuild', 'lib', 'main.js'));
}
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
