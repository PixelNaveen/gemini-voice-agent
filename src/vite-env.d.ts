/**
 * Ambient types for Vite's `import.meta.env`.
 *
 * ## Why this file exists instead of `"types": ["vite/client"]` in tsconfig.json
 *
 * The usual way to get these types is to list `vite/client` in `compilerOptions.types`. That was
 * done here, and it broke the Vercel Function build:
 *
 *   error TS2688: Cannot find type definition file for 'vite/client'.
 *
 * `compilerOptions.types` is not scoped to the files that need it — it applies to *every*
 * compilation that uses the tsconfig, including the server. The Vercel function build compiles
 * `api/index.ts` in an isolated dependency context that contains only the packages the function
 * actually imports; Vite is a client-side build tool and is not among them, so the type library
 * named in the config cannot be resolved and the build fails before emitting anything.
 *
 * The failure is particularly unhelpful because nothing in `api/index.ts` or `server.ts` has
 * anything to do with Vite. The config was forcing a client-only dependency on a server build.
 *
 * Declaring the shape here keeps the same ergonomics — `import.meta.env.DEV` stays typed — with
 * no resolution requirement, so the client build and the function build each see only what they
 * need. The members below are the ones this project uses; Vite may expose more at runtime, but
 * nothing here should depend on an undeclared member.
 *
 * This is a types-only file. It emits nothing and is safe to include in any compilation.
 */

interface ImportMetaEnv {
  /**
   * True during `vite dev`, false in a production build. Used to guard development-only
   * diagnostics so they do not ship or execute in production.
   */
  readonly DEV: boolean;
  /** True while running `vite build`. */
  readonly PROD: boolean;
  /** True when running the Vite dev server. */
  readonly SSR: boolean;
  /** Deployment base path, if one is configured. */
  readonly BASE_URL: string;
  /** Build mode, e.g. "production" or "staging". */
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Vite turns these imports into URL references at build time, and the stylesheet into a real CSS
 * side effect. TypeScript has no idea that, so without these declarations a bare
 * `import './index.css'` is an error rather than the valid, meaningful statement it is.
 *
 * Declared per-extension rather than as a wildcard so that a genuinely misspelled import still
 * fails: `*` here would quietly accept `./styles.typo` and leave the error to surface as a blank
 * page at runtime.
 */
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
declare module '*.styl';

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.avif' {
  const src: string;
  export default src;
}

declare module '*.ico' {
  const src: string;
  export default src;
}

declare module '*.woff' {
  const src: string;
  export default src;
}

declare module '*.woff2' {
  const src: string;
  export default src;
}

/**
 * Environment variables exposed with Vite's `VITE_` prefix, e.g. `import.meta.env.VITE_API_URL`.
 *
 * `readonly [key: string]: any` is the shape Vite itself documents for the env namespace. It is
 * deliberately an index signature rather than named members: which variables exist is a build-time
 * property of the deployment, and enumerating them in this file would mean keeping two lists in
 * sync for no safety gain.
 */
interface ImportMetaEnv {
  readonly [key: string]: any;
}
