# CLAUDE.md — allomoney-library contributor guide

Guidance for any AI or human contributor working on this library. Read it
before generating code or running scaffolding commands. Rules here are
**non-negotiable** unless a maintainer explicitly overrides them.

## Purpose

A dependency-free, standalone Angular components library for building financial
applications.

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
  `.component`/`.service` suffix).

## Definition of done (a task is not complete until these pass)

Run from the repo root and fix failures before reporting the task finished — do
not ask a maintainer to run them for you:

```bash
npm run build        # must compile clean (postbuild finalizes the manifest)
npm test             # unit tests for changed code must pass
npm run lint         # if a lint script exists — no new warnings
```

For any change to the public API or the built package, also run
`npm run pack:check` and READ the printed file list (see Release process).

Additional gates:
- New/changed rendering output MUST have a test asserting SVG structure and a11y roles.
- New UI MUST pass AXE and WCAG 2.1 AA (contrast, focus, keyboard, text alternatives).
- No `any` leaking into public `.d.ts`; no `console.log`, dead code, or unexplained
  `TODO` in the diff.

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

## Component & rendering authoring rules (Angular 22)

These are the v22 idioms this library is written in. They are consistent with
the Hard constraints above; where a common Angular rule does NOT apply here,
that is noted so you don't add it by reflex.

- Standalone only; do NOT write `standalone: true` (it is the default).
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly — it
  is the default in v22.
- Use `inject()`; never constructor parameter injection.
- State is signals: `signal()`, and `computed()` for anything derivable (layout
  results, scales, formatted labels). Never call `.mutate()` — use `.set()` /
  `.update()`.
- Component I/O uses the `input()` / `output()` functions, never `@Input()` /
  `@Output()` decorators.
- Native control flow only: `@if` / `@for` / `@switch`. Every `@for` over nodes
  or links MUST `track` a stable id — SVG element diffing over large graphs
  depends on it for correctness and performance.
- Host bindings/listeners go in the `host` object of the decorator, never
  `@HostBinding` / `@HostListener` (e.g. host `role`, resize wiring).
- Use `class` and `style` bindings, never `ngClass` / `ngStyle`.
- TypeScript strict; avoid `any`, use `unknown` when genuinely unknown. Exported
  types are explicit and stable — never let inference widen a public return type.
- Keep the component thin: it binds signals to SVG. All geometry lives in the
  dependency-free `internal/` layout engine as pure functions.

Rules that deliberately do NOT apply to this library:
- **`NgOptimizedImage`: N/A.** The diagram is native SVG and the empty-state art
  is a CSS data-URI, which `NgOptimizedImage` does not support. Only consider it
  if a real raster `<img>` is ever introduced.
- **Forms (Signal/Reactive): N/A.** This is a display component. If interactive
  inputs are ever added, prefer Signal Forms (`@angular/forms/signals`),
  otherwise Reactive forms — never template-driven.

## TypeScript conventions

The public API IS the product — exported types are a semver contract, so
discipline here is stricter than in an app.

- Strict mode; avoid `any`, use `unknown` when a type is genuinely open. Never
  use `!` non-null assertions to hide nullability — model it in the type.
- **Explicit types on every public boundary.** Every exported function/method
  declares its return type; never let inference widen or narrow the shipped
  `.d.ts`. Use inference freely for locals where the type is obvious.
- Public model types (`SankeyData`, `SankeyNode`, `SankeyLink`, …) are
  **`readonly` / immutable**. Treat consumer-supplied data as immutable — copy
  before transforming, never mutate an input.
- Prefer string-literal union types (like `SankeyTheme`) over enums; do NOT use
  `const enum` (breaks under isolated modules and hurts consumers).
- Use `satisfies` for config defaults (`DEFAULT_ALLOMONEY_LIBRARY_CONFIG`) to
  keep them tightly typed without widening.
- **No top-level side effects** in any file reachable from `public-api.ts` — the
  library must stay tree-shakable (`sideEffects: false`-friendly). `internal/` is
  pure functions only.
- Import specific symbols from `@angular/core` / `@angular/common`; no deep or
  transitive imports. No `I`-prefixed interface names.

## HTML / template conventions

- Prefer an **inline template** on the component (it is small and SVG-focused).
- **Zero logic in templates.** No method calls or non-trivial expressions in
  bindings — they re-run every change-detection cycle. Precompute everything in
  `computed()`; use `@let` for template-local derived values.
- `@for` over nodes/links MUST `track` a stable id, never `$index` — keyed SVG
  diffing depends on it.
- **SVG attribute gotcha:** bind geometry with `[attr.*]` (`[attr.d]`,
  `[attr.x]`, `[attr.transform]`, `[attr.width]`) since these are attributes, not
  DOM properties. Use `href`, never deprecated `xlink:href`.
- Emit the accessibility nodes in the template: `<title>` / `<desc>`, `role`, and
  `aria-*` (see Accessibility).
- Render labels via interpolation / `<text>` content (auto-escaped). NEVER
  `innerHTML` or `bypassSecurityTrust*` (see SVG / XSS note).
- The empty state renders real text, not only the background image.

## SCSS conventions

- **`@use` / `@forward` only — never `@import`** (deprecated in Sass).
- Zero SCSS dependencies: no Bootstrap, Material theming, or other framework
  imports (mirrors the zero-runtime-dependency rule).
- **Theme via CSS custom properties.** Expose a small, documented set of
  `--allomoney-*` variables as the theming contract — this lets consumers restyle
  and switch light/dark **at runtime with no `angular.json` change or rebuild**,
  honoring "no consumer configuration." These variable names are effectively part
  of the public surface; treat a rename as a breaking change.
- Drive light/dark from a host class/attribute toggled via the decorator `host`
  object (e.g. `[class.allomoney-dark]`), not two duplicated palettes.
- Keep styles component-scoped (default emulated encapsulation). No global
  selectors, **no `::ng-deep`** (deprecated), no bare element selectors that leak.
- Honor `prefers-color-scheme` and `prefers-reduced-motion`. All node/link colors
  meet WCAG AA contrast in both themes.
- **Do not touch the empty-state pattern:** keep
  `background-image: url('./assets/…')` so ng-packagr inlines the SVGs as
  data-URIs; never convert them to `<img>` or external references.
- Minimize specificity; avoid `!important`. External style-file paths are
  relative to the component `.ts` (v20+ convention).

## Accessibility (SVG data-viz — hard requirement)

A Sankey diagram is not accessible by default. Treat these as gates, not extras:

- The `<svg>` root exposes an accessible name — `role="img"` (or `figure`) with
  `<title>` / `aria-labelledby`, plus a `<desc>` or visually-hidden summary of
  the main flows.
- Provide a text alternative for the data (e.g. a visually-hidden list/table of
  `source → target = value`) so information is not conveyed by color/position alone.
- Never encode meaning by color alone; node/link colors must meet WCAG AA
  contrast against the background in BOTH light and dark themes.
- If nodes/links are interactive, they are keyboard-focusable with a visible
  focus ring, correct roles/labels, and a logical focus order.
- Respect `prefers-reduced-motion` for any transitions.
- The empty state exposes its message as real text, not only the background SVG.
- Must pass AXE with zero violations.

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

## Testing

- **Layout engine first.** `internal/` is pure and deterministic — cover rank
  assignment, crossing minimization, and value-proportional positioning directly
  with unit tests. This is the highest-value surface and never leaves `internal/`.
- **Public API contract.** Every symbol in `public-api.ts` gets a test that pins
  its behavior/shape — it is a semver contract, so a breaking change should break
  a test.
- **Rendering.** Assert SVG structure (node/link counts, `<path>`/`<text>`
  presence), each `input()` variation, the empty state, and a11y roles — via the
  component's public template/inputs, never private internals or `internal/`
  imports.
- Run through the configured runner (`npm test`). Build the library before
  testing the demo, since the demo resolves the real package via the tsconfig
  `paths` alias.

## SVG / rendering & XSS note

- The empty-state SVGs are **safe**: they are CSS-embedded data-URIs and
  execute no script.
- Build the diagram through Angular template bindings — `<text>` content and
  interpolation (auto-escaped) and computed `d`/coordinate attributes. **Never**
  inject untrusted node/link labels via `innerHTML` or `bypassSecurityTrustHtml`.
- Validate/sanitize any user-supplied strings to avoid XSS.

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
