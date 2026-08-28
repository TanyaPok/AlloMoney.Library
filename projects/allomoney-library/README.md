# allomoney-library

A **zero-dependency, standalone Angular Sankey diagram** component. A Sankey
diagram visualizes _flows_ — where quantities split, merge, and move between
stages — making it ideal for budgets, cash-flow, energy/material flows, and
conversion funnels.

- **No runtime dependencies** beyond Angular — no D3, no charting library.
- **Standalone + signals**, Angular 22.
- **Zero consumer configuration**: light/dark empty-state placeholders ship
  inline (CSS data-URIs), so there's nothing to add to your `angular.json`.

## Install

```bash
npm i allomoney-library
```

## Usage

Add the provider once at bootstrap, then drop the component into any template.

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAlloMoneyLibrary } from 'allomoney-library';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [
    provideAlloMoneyLibrary({ defaultTheme: 'light' }),
  ],
});
```

```ts
// app.ts
import { Component, signal } from '@angular/core';
import { AllomoneySankeyDiagram, type SankeyData } from 'allomoney-library';

@Component({
  selector: 'app-root',
  imports: [AllomoneySankeyDiagram],
  template: `<allomoney-sankey-diagram [data]="flows()" [options]="{ theme: 'dark' }" />`,
})
export class App {
  readonly flows = signal<SankeyData>({
    nodes: [
      { id: 'income', label: 'Income' },
      { id: 'rent', label: 'Rent' },
      { id: 'savings', label: 'Savings' },
    ],
    links: [
      { source: 'income', target: 'rent', value: 1200 },
      { source: 'income', target: 'savings', value: 800 },
    ],
  });
}
```

When `data` is empty or omitted, the component renders a themed **empty state**
instead of a diagram.

## Theming

Pass `theme="light"` / `theme="dark"` (or the `options` form
`[options]="{ theme: 'dark' }"`, which wins if both are set), or set a
library-wide default via `provideAlloMoneyLibrary({ defaultTheme })`. The
light/dark empty-state
placeholders are **embedded inline** in the component's CSS as data-URIs —
**zero configuration required**, nothing to copy into your build.

## API

### `AllomoneySankeyDiagram` — inputs

| Input   | Type                      | Default               | Description                                                        |
| ------- | ------------------------- | --------------------- | ------------------------------------------------------------------ |
| `data`    | `SankeyData \| undefined` | `undefined`           | Nodes + links to render. Empty/undefined shows the empty state.    |
| `options` | `SankeyOptions`           | `{}`                  | Presentation options and edit flags, kept separate from the graph. Any field set here overrides the matching element input below. |
| `theme` | `'light' \| 'dark'` | config `defaultTheme` | Visual theme; also selects the light/dark empty-state placeholder. |
| `currency` | `string \| null` | `null` | ISO 4217 code; formats node/link values as currency, else plain numbers. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Flow direction. |
| `width` / `height` | `number \| null` | `null` (100% of container) | Rendered size in CSS pixels. Invalid or display-distorting values are ignored (logged) and the default size is used. |
| `canEditNodeName` / `canEditNodeValue` | `boolean` | `false` | Allow editing a node's name / value by double-click. |
| `canEditLinkValue` / `canEditLinkSource` / `canEditLinkTarget` | `boolean` | `false` | Allow editing a link's value / re-pointing its source / target. |

Every field in `options` — `theme`, `currency`, `orientation`, `width`,
`height`, and the five `canEdit*` flags — can be set **either** as an element
input (`[theme]="'dark'"`, `[height]="520"`, `[canEditNodeName]="true"`) **or**
through `options` (`{ theme: 'dark', height: 520, canEditNodeName: true }`). When
both are supplied for the same field, the **`options` value wins**.

### Sizing

By default the diagram fills **100% of its container** on both axes. Set `width`
and/or `height` (CSS pixels) to pin a fixed size. Each must be a positive number
of at least **200px**, and when both are given their ratio must stay reasonably
close to the diagram's natural proportions; a value that is invalid or would
significantly distort the display is **ignored, an error is logged to the
console, and the diagram renders at its default size**.

### Outputs

| Output       | Type | Status  | Description                                        |
| ------------ | ---- | ------- | -------------------------------------------------- |
| `nodeSelect` | —    | Planned | Will emit when a node is activated (future).       |
| `linkSelect` | —    | Planned | Will emit when a link/flow is activated (future).  |

> The Sankey layout/render is under active development. Today the component
> validates its data and renders the empty state; live diagram rendering lands
> in a subsequent release.

### Exported types

`SankeyData`, `SankeyOptions`, `SankeyNode`, `SankeyLink`, `SankeyTheme`,
`AlloMoneyLibraryConfig`, `provideAlloMoneyLibrary`, `ALLOMONEY_LIBRARY_CONFIG`.

## Compatibility

- **Angular 22** (`@angular/core` and `@angular/common` `^22.0.0`).

## License

[MIT](./LICENSE)