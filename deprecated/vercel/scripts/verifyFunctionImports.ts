/**
 * Regression test for F-54: the deployed function artifact must be able to resolve its imports.
 *
 * ## Why this file exists
 *
 * The deployment returned `500 FUNCTION_INVOCATION_FAILED` on `/health`, `/ready`, `/api/live-token`
 * and `/live`:
 *
 * ```
 * Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server'
 *   imported from /var/task/api/index.js
 * ```
 *
 * `api/index.ts` imported `'../server'`. Vercel transpiles a function but does not bundle it, so the
 * specifier survives into `api/index.js` and native ESM resolves it *literally*. There is no
 * extension-guessing fallback in ESM the way there is in CommonJS, so nothing named `server`
 * existed and the import threw before a single route was registered. The static build kept serving,
 * which made the site look alive with a dead backend.
 *
 * ## Why the existing checks could not see it
 *
 * Every other verification passed, and each one had the same blind spot:
 *
 * - `tsc --noEmit` and the 205-test suite resolve specifiers with Node-style extension guessing.
 * - `vite build` only handles the client graph; the server is not in it.
 * - `scripts/verifyFunctionBundle.ts` **bundles** with esbuild, and bundling inlines `../server`.
 *   The broken specifier is erased by the very act of bundling, so the test could never fail on
 *   the bug it was nominally guarding.
 * - `scripts/verifyEntrypointSafety.ts` runs the source through tsx, which guesses extensions.
 *
 * A test that cannot fail on the deployed artifact is decoration. This one does not bundle, because
 * not bundling is the condition that produced the outage.
 *
 * ## What it asserts
 *
 * 1. The function transpiles without bundling, exactly as the platform compiles it.
 * 2. That emitted ESM **imports successfully under bare `node`**, from a directory whose layout
 *    mimics `/var/task`. This is the real test: it is the platform's own module loader, not a
 *    resolver with the bug's escape hatch built in.
 * 3. The handler is actually exported and callable.
 * 4. A negative control: a copy of the source with the import rewritten back to the extensionless
 *    form fails the same way production did. Without this, assertion 2 would pass just as well for a
 *    broken build, and a future change that broke resolution would sail through.
 * 5. No extensionless relative import exists in the emitted output at all, so the next missing-file
 *    class is caught even when the file happens to exist locally.
 *
 * ## Usage
 *
 *   npx tsx scripts/verifyFunctionImports.ts
 *
 * Requires `npm run build:server` to have produced `server.mjs`. Exits non-zero on failure.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

/**
 * Locates the esbuild binary.
 *
 * This project runs as ESM under tsx, so `__dirname` is unavailable and the module path comes from
 * `import.meta.url` - precisely the expression that broke the server under a CommonJS bundle, where
 * `import.meta` was an empty object. The two derivations are genuinely different, which is the
 * reason the server bug was possible in the first place.
 */
function findEsbuild(): string {
  const shim = path.join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild');
  if (fs.existsSync(shim)) {
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
  throw new Error('esbuild was not found under node_modules. Run `npm install` before this check.');
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` -> ${detail}` : ''}`);
}

const serverBundle = path.join(repoRoot, 'server.mjs');

/**
 * Creates a directory that mimics Vercel's `/var/task`: an ESM package root holding `api/index.js`
 * plus the server bundle beside it.
 *
 * The directory is created *inside the repository* rather than the OS temp dir on purpose. The
 * server bundle keeps its npm dependencies external (`--packages=external`), so loading it requires
 * a real `node_modules`. Placing the fixture in the repo makes Node's normal upward directory walk
 * find the installed tree, which is also what happens on the platform. A temp dir would fail on
 * `Cannot find package 'express'` and hide the import-resolution question this file exists to ask.
 */
function makeTaskDir(name: string): string {
  const dir = fs.mkdtempSync(path.join(repoRoot, '.tmp-' + name));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'task', private: true, type: 'module', version: '1.0.0' }, null, 2)
  );
  fs.mkdirSync(path.join(dir, 'api'), { recursive: true });
  return dir;
}

/**
 * Transpiles a function entrypoint the way the platform does: no bundling, ESM output, so import
 * specifiers survive verbatim into the emitted file.
 */
function transpile(esbuild: string, entry: string, outfile: string): { ok: boolean; detail: string } {
  const args = [
    entry,
    '--format=esm',
    '--platform=node',
    '--target=node22',
    '--outfile=' + outfile,
    '--log-level=error',
  ];
  try {
    execFileSync(esbuild, args, { cwd: repoRoot, stdio: 'pipe' });
    return { ok: true, detail: (fs.statSync(outfile).size / 1024).toFixed(1) + ' kB' };
  } catch (err) {
    return { ok: false, detail: String((err as Error).message).split('\n').slice(0, 3).join(' ') };
  }
}

/**
 * Imports the emitted function under bare `node` and reports the outcome.
 *
 * Runs in a child process because a module-scope throw *is* the failure being tested, and this
 * script would otherwise die before printing a result. The timeout catches an import that neither
 * loads nor throws.
 */
function importEmitted(taskDir: string): { ok: boolean; detail: string } {
  const script = `
    const t = setTimeout(() => { console.log('HUNG'); process.exit(2); }, 30000);
    import('./api/index.js').then((m) => {
      clearTimeout(t);
      const handler = typeof m.default === 'function' ? m.default : m;
      console.log('OK handler=' + typeof handler);
      process.exit(typeof handler === 'function' ? 0 : 1);
    }).catch((e) => {
      clearTimeout(t);
      // The code is reported separately from the message because a resolution failure reads as
      // "Cannot find module '<path>'", where the path itself is the evidence. Forgetting the
      // trailing extension is invisible in prose but obvious in the code.
      console.log('THREW ' + (e.code || e.name) + ' ' + String(e.message).slice(0, 220));
      process.exit(1);
    });
  `;
  try {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: taskDir,
      env: {
        ...process.env,
        GEMINI_API_KEY: 'test-key-not-used-at-import',
        VERCEL: '1',
        NODE_ENV: 'production',
      },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { ok: out.includes('OK handler='), detail: out.trim().split('\n').pop() ?? '' };
  } catch (err) {
    const out = String((err as { stdout?: string }).stdout ?? '');
    const line = out.trim().split('\n').filter(Boolean).pop() ?? 'no output';
    return { ok: false, detail: line.slice(0, 220) };
  }
}

/**
 * Every relative specifier in an emitted file, with the `.js`/`.mjs` extension stripped.
 *
 * Node's ESM resolver appends nothing. A specifier whose target does not exist is fatal at import
 * time regardless of what is on disk, so this is checked as a source of truth and not only through
 * a single end-to-end import.
 */
function relativeSpecifiers(emitted: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(emitted)) !== null) out.push(m[1]);
  return [...new Set(out)].sort();
}

function main(): void {
  console.log('\n[verify:function-imports] Loading the deployed artifact under native ESM\n');

  const esbuild = findEsbuild();
  const built = fs.existsSync(serverBundle);
  check(
    'the server bundle exists (run `npm run build:server` first)',
    built,
    built ? 'server.mjs present' : 'server.mjs is missing'
  );
  if (!built) {
    console.log('\n[verify:function-imports] 0 passed, 1 failed.');
    process.exit(1);
  }

  // The real artifact: transpiled without bundling, server bundle beside it, loaded by Node.
  const taskDir = makeTaskDir('aura-task-');
  const emittedIndex = path.join(taskDir, 'api', 'index.js');
  fs.copyFileSync(serverBundle, path.join(taskDir, 'server.mjs'));

  const transpiled = transpile(esbuild, 'api/index.ts', emittedIndex);
  check('the function transpiles without bundling', transpiled.ok, transpiled.detail);

  if (transpiled.ok) {
    const loaded = importEmitted(taskDir);
    check(
      'the emitted ESM loads under bare node and exports a handler',
      loaded.ok,
      loaded.detail
    );

    const emitted = fs.readFileSync(emittedIndex, 'utf8');
    const specifiers = relativeSpecifiers(emitted);
    const extensionless = specifiers.filter((s) => !/\.(m?js|cjs|json|node)$/.test(s));
    check(
      'every relative import in the emitted output carries a file extension',
      extensionless.length === 0,
      extensionless.length > 0
        ? 'extensionless: ' + extensionless.join(', ')
        : 'specifiers: ' + (specifiers.join(', ') || 'none')
    );
  }

  // Negative control.
  //
  // If the happy path above can pass for a *broken* build, it is not a test. This reproduces the
  // shipped defect - the same source with the specifier rewritten to the extensionless form - and
  // requires it to fail the same way production did. A control that stopped failing would mean the
  // real assertion had gone hollow, so this is the most important line in the file.
  const brokenDir = makeTaskDir('aura-task-broken-');
  const brokenSrc = path.join(brokenDir, 'broken-entry.ts');
  const original = fs.readFileSync(path.join(repoRoot, 'api', 'index.ts'), 'utf8');
  const reverted = original.replace(/from\s*['"]\.\.\/server\.mjs['"]/, "from '../server'");
  const actuallyReverted = reverted !== original;
  fs.writeFileSync(brokenSrc, reverted);
  fs.copyFileSync(serverBundle, path.join(brokenDir, 'server.mjs'));

  const brokenBuilt = actuallyReverted
    ? transpile(esbuild, brokenSrc, path.join(brokenDir, 'api', 'index.js'))
    : { ok: false, detail: 'could not rewrite the import for the control' };
  check('the negative control can be built', brokenBuilt.ok, brokenBuilt.detail);

  if (brokenBuilt.ok) {
    const brokenLoad = importEmitted(brokenDir);
    const failedAsExpected = !brokenLoad.ok && /ERR_MODULE_NOT_FOUND/.test(brokenLoad.detail);
    check(
      'an extensionless relative import fails with ERR_MODULE_NOT_FOUND (control)',
      failedAsExpected,
      brokenLoad.detail
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    '\n[verify:function-imports] ' +
      (results.length - failed.length) +
      ' passed, ' +
      failed.length +
      ' failed.'
  );

  for (const dir of [taskDir, brokenDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a leftover temp directory is not worth failing the run over */
    }
  }

  if (failed.length > 0) process.exit(1);
}

main();
