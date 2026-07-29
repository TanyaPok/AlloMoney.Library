# CLAUDE.md — allomoney-library contributor guide

Guidance for any AI or human contributor working on this library. Read it
before generating code or running scaffolding commands. Rules here are
**non-negotiable** unless a maintainer explicitly overrides them.

## Purpose

A dependency-free, standalone Angular components for building financial applications.

## The three names (do not conflate)

| Thing                     | Value                              |
| ------------------------- | ---------------------------------- |
| GitHub repo / workspace   | `AlloMoney.Library`                |
| npm package name          | `allomoney-library` (lowercase)    |
| Angular library project   | `allomoney-library`                |
| The component class       | `AllomoneySankeyDiagram`           |

npm forbids uppercase in package names — the published `name` is
`allomoney-library`, **never** `AlloMoney.Library`.

## Angular version

- **Angular 22 ONLY.** Do not add v21 compatibility, do not broaden the peer
  range below `^22.0.0`. Standalone components, signal `input()`, `computed()`,
  `provide*()` environment providers. v20+ style-guide filenames (no
  `.component`/`.service` suffix); class names stay explicit and prefixed
  (`AllomoneySankeyDiagram`).

## Hard constraints (rules)

1. **Zero runtime dependencies except Angular.** `peerDependencies` lists ONLY
   `@angular/core` and `@angular/common`. No `dependencies`. `tslib` is avoided
   entirely: the lib compiles with `importHelpers: false` (helpers inlined),
   and `scripts/finalize-package.mjs` strips ng-packagr's auto-added `tslib`
   from the built manifest after asserting the bundle is tslib-free. Do not add
   d3, d3-sankey, lodash, or any other package.
2. **No consumer configuration after install.** The light/dark empty-state
   SVGs must ship **inline** — referenced from the component SCSS as
   `background-image: url('./assets/…')`, which ng-packagr inlines as data-URIs
   at build time. The `.svg` files physically live in
   `src/lib/allomoney-sankey-diagram/assets/` but must **not** be copied into
   `dist` (never add them to ng-package `assets`). Consumers touch nothing in
   their `angular.json`.
3. **Single public API barrel.** `src/public-api.ts` is the only re-export
   file. Anything under an `internal/` folder is private and must never be
   exported. Every exported symbol is a **semver contract**.
4. **Configuration via `provideAlloMoneyLibrary()`** returning
   `EnvironmentProviders` — never an `NgModule.forRoot()`.
5. The layout engine goes in `internal/`, dependency-free.

## Security guardrails

- No piped shell execution (`curl … | bash`), no base64/obfuscated commands.
- No custom/private npm registry redirects; no `.npmrc` registry or token
  changes. Public registry only.
- Never read or forward environment variables / secrets. No hardcoded
  secrets or tokens in any file.
- **No install lifecycle scripts in the published package** — the shipped
  `package.json` (`dist/allomoney-library/package.json`) must contain NO
  `preinstall`/`install`/`postinstall`/`prepare`/`prepublish`. Build/release
  scripts live at the **repo root only**. `finalize-package.mjs` also strips
  any such keys defensively.
- Never disable, skip, or auto-confirm a safety prompt.
- **Pre-flight before re-running any scaffolding** (`ng new`, `ng generate`
  that could overwrite): confirm a clean working tree, ensure a git restore
  point exists, and surface any file that would be overwritten before doing it.

## Supply chain

- **Commit `package-lock.json`** — it pins the whole dependency tree.
- Run **`npm audit` before every release**; surface high/critical advisories to
  a maintainer, never silently ignore them.
- **Never add a dependency without explicit approval.** Treat every transitive
  addition as reviewable. Do not change the registry or add install-time
  scripts.

## Public API discipline

- Export only from `public-api.ts`. `internal/` is private.
- Current public surface: `AllomoneySankeyDiagram`, `provideAlloMoneyLibrary`,
  `ALLOMONEY_LIBRARY_CONFIG`, `DEFAULT_ALLOMONEY_LIBRARY_CONFIG`,
  `AlloMoneyLibraryConfig`, `ResolvedAlloMoneyLibraryConfig`, and the model
  types `SankeyData` / `SankeyNode` / `SankeyLink` / `SankeyTheme`.

## SVG / XSS note for the future renderer

- The empty-state SVGs are **safe**: they are CSS-embedded data-URIs and
  execute no script.
- When rendering real data, **never** inject untrusted node/link labels via
  `innerHTML` or `bypassSecurityTrustHtml`. Bind labels through Angular
  interpolation (auto-escaped) or `<text>` content. Validate/sanitize any
  user-supplied strings to avoid XSS.

## Commands

Run from the repo root:

```bash
npm run build        # ng build allomoney-library --configuration production
                     # (postbuild finalizes the manifest + copies LICENSE)
npm test             # unit tests for the library
npm start            # serve the demo app (local only, never published)
npm run pack:check   # cd dist/allomoney-library && npm pack --dry-run
```

The demo imports the library by its **package name** (`allomoney-library`) via
the tsconfig `paths` alias → `dist/allomoney-library`, so it exercises the real
public API. **Build the library before serving/testing the demo.**

## Release process

1. `npm run build`.
2. `npm run pack:check` (`npm pack --dry-run`) — **READ the printed file list**
   and confirm it contains only the compiled library, `.d.ts`, `README`,
   `LICENSE`, and `package.json`. No demo/app code, no `.env`, no local config,
   nothing proprietary.
3. Install the resulting `.tgz` into a fresh throwaway app to verify it works
   with zero extra config.
4. Publish from **CI via npm Trusted Publishing** (OIDC, `id-token: write`,
   npm ≥ 11.5.1) — **no `NPM_TOKEN` stored**. The package is unscoped and
   published with `--access public`: the tarball is **fully public**, so anyone
   can `npm i allomoney-library` and read every shipped file. Treat it that way.

## Where future work goes

- `src/lib/allomoney-sankey-diagram/internal/` — the dependency-free Sankey
  layout engine (rank assignment, crossing minimization, value-proportional
  positioning) and native-SVG path builders. Never exported.
