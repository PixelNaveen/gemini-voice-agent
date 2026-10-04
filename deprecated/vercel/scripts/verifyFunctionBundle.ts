/**
 * Regression test for F-53: the function must be importable as the CommonJS bundle Vercel
 * actually deploys.
 *
 * ## Why this file exists
 *
 * The deployment returned `500 FUNCTION_INVOCATION_FAILED` on every single route while the local
 * server, the 205-test suite, and even an ESM bundle all passed. The crash was a module-scope
 * `fileURLToPath(import.meta.url)`, and it was invisible everywhere except the one artifact that
 * mattered: Vercel bundles a function to CommonJS, replaces `import.meta` with an empty object,
 * and the call then throws `ERR_INVALID_ARG_TYPE` before a single route is registered.
 *
 * Every check that ran before this one was therefore testing the wrong artifact. This one builds
 * the real thing - the same entrypoint, the same bundler, the same CommonJS format, the same Node
 * target - and requires it, so the module-scope code is executed under the conditions that killed
 * it. A test that cannot fail on the deployed artifact is not worth much here.
 *
 * ## What it asserts
 *
 * 1. The CommonJS bundle builds at all.
 * 2. Requiring it with `VERCEL=1` does not throw, and exports a handler.
 * 3. Requiring it with no `GEMINI_API_KEY` does not throw either.
 * 4. The bundle contains no `fileURLToPath(import.meta` call, so the trap cannot be reintroduced
 *    by an unrelated edit.
 *
 * ## Usage
 *
 *   npx tsx scripts/verifyFunctionBundle.ts
 *
 * Exits non-zero on failure, so it belongs in CI.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/**
 * Locates the esbuild binary.
 *
 * This project runs as ESM under tsx, so `__dirname` is not available and the module path is
 * derived from `import.meta.url` instead - the very thing F-53 removed from the server, where it
 * ran under a CommonJS bundle where the same expression was undefined. The two files genuinely
 * need opposite derivations, which is the whole reason the server bug was possible.
 *
 * esbuild is a devDependency and is present in every checkout that can run the build, so a
 * failure here means a broken install rather than a missing tool to be worked around.
 */
function findEsbuild(): string {
  const shim = path.join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (fs.existsSync(shim)) {
    // The shim is a JS launcher on Windows and a native binary elsewhere; prefer the platform
    // binary that esbuild installed as an optional dependency, and fall back to the shim.
    const platformBinary =
      process.platform === 'win32'
        ? path.join(repoRoot, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe')
        : path.join(
            repoRoot,
            'node_modules',
            '@esbuild',
            `${process.platform}-${process.arch}`,
            'esbuild'
          );
    if (fs.existsSync(platformBinary)) return platformBinary;
    return shim;
  }
  throw new Error(
    'esbuild was not found under node_modules. Run `npm install` before this check.'
  );
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-fn-bundle-'));
const bundlePath = path.join(outDir, 'index.cjs');

/** Builds `api/index.ts` the way the function runtime does, and reports whether it succeeded. */
function buildBundle(esbuild: string): { ok: boolean; detail: string } {
  const args = [
    'api/index.ts',
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    `--outfile=${bundlePath}`,
    // The only specifier this repo cannot resolve locally; it is a Vite-internal devtools import
    // that the bundler reaches through a dynamic import. Marking it external keeps the build
    // reproducible without changing what the function bundle actually contains.
    '--external:@vitejs/devtools/config',
    '--log-level=error',
  ];
  try {
    execFileSync(esbuild, args, { cwd: repoRoot, stdio: 'pipe' });
    return { ok: true, detail: `${(fs.statSync(bundlePath).size / 1024 / 1024).toFixed(1)} MB` };
  } catch (err) {
    return { ok: false, detail: String((err as Error).message).split('\n').slice(0, 3).join(' ') };
  }
}

/** Requires the bundle in a child process, because a throw here is exactly what we are testing. */
function requireBundle(env: Record<string, string>): { ok: boolean; detail: string } {
  const script = `
    const t = setTimeout(() => { console.log('HUNG'); process.exit(2); }, 25000);
    try {
      const m = require(${JSON.stringify(bundlePath)});
      clearTimeout(t);
      const handler = typeof m.default === 'function' ? m.default : m;
      console.log('OK handler=' + typeof handler);
      process.exit(typeof handler === 'function' || typeof handler === 'object' ? 0 : 1);
    } catch (e) {
      clearTimeout(t);
      console.log('THREW ' + e.name + ' ' + String(e.message).slice(0, 200));
      process.exit(1);
    }
  `;
  try {
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        // A directory with no `.env`, so dotenv cannot repopulate a key the test is removing.
        GEMINI_API_KEY: env.GEMINI_API_KEY ?? '',
        VERCEL: env.VERCEL ?? '1',
        NODE_ENV: 'production',
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: out.includes('OK handler='), detail: out.trim().split('\n').pop() ?? '' };
  } catch (err) {
    const out = String((err as { stdout?: string }).stdout ?? '');
    const line = out.trim().split('\n').filter(Boolean).pop() ?? 'no output';
    return { ok: false, detail: line.slice(0, 200) };
  }
}

function main(): void {
  console.log('\n[verify:function-bundle] Building and loading the CommonJS function bundle\n');

  const esbuild = findEsbuild();
  const built = buildBundle(esbuild);
  check('the CommonJS function bundle builds', built.ok, built.detail);

  if (built.ok) {
    const withKey = requireBundle({ VERCEL: '1', GEMINI_API_KEY: 'test-key-not-used-at-import' });
    check(
      'the bundle loads with VERCEL=1 and a key present',
      withKey.ok,
      withKey.detail
    );

    const withoutKey = requireBundle({ VERCEL: '1', GEMINI_API_KEY: '' });
    check(
      'the bundle loads with no GEMINI_API_KEY instead of exiting',
      withoutKey.ok,
      withoutKey.detail
    );

    // The specific expression that killed every invocation, asserted on the artifact rather than
    // on the source so an unrelated refactor cannot quietly reintroduce it.
    //
    // Scoped to the code this project owns. Bundling reaches into dependencies that legitimately
    // contain `fileURLToPath(import.meta.url)` - `open` does exactly that - and those live inside
    // their own function bodies, so they never execute at import. A repository-wide match would
    // flag them and train people to ignore this check, so the assertion is anchored to the
    // function that failed.
    const contents = fs.readFileSync(bundlePath, 'utf8');
    const hasResolver = /function resolveModuleDir\(\)/.test(contents);
    const resolverStart = hasResolver ? contents.indexOf('function resolveModuleDir()') : -1;
    // The dangerous form is a module-scope statement, which in the emitted bundle appears between
    // the resolver and the first `bootProblems` declaration.
    const moduleScopeWindow =
      resolverStart >= 0 ? contents.slice(resolverStart, contents.indexOf('var bootProblems', resolverStart)) : '';
    const reintroduced = resolverStart < 0 || /fileURLToPath\)\(\s*import_meta\w*\.url/.test(moduleScopeWindow);
    check(
      'module scope resolves its directory without import.meta',
      !reintroduced,
      hasResolver ? 'uses resolveModuleDir()' : 'resolveModuleDir() is missing from the bundle'
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[verify:function-bundle] ${results.length - failed.length} passed, ${failed.length} failed.`);

  try {
    fs.rmSync(outDir, { recursive: true, force: true });
  } catch {
    /* a leftover temp directory is not worth failing the run over */
  }

  if (failed.length > 0) process.exit(1);
}

main();
