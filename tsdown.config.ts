import { defineConfig } from 'tsdown';

/**
 * Two emit entries — main + codegen subpath:
 *
 *   dist/index.js + dist/index.d.ts          → `@layers/amba-client`
 *   dist/codegen/index.js + .d.ts            → `@layers/amba-client/codegen`
 *
 * The codegen subpath is consumed by `amba types generate` via the
 * `./codegen` exports map in package.json. Splitting it from the main
 * bundle keeps the CLI's tree-shaken bundle small — codegen pulls no
 * client-runtime code, just an HTTP-client interface and a string emitter.
 *
 * `hash: false` keeps emitted .d.ts filenames stable so they match
 * `package.json` `types` / `exports`.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/codegen/index.ts'],
  format: 'esm',
  dts: true,
  hash: false,
  clean: true,
  sourcemap: false,
});
