# allomoney-library

A **zero-dependency, standalone Angular Sankey diagram** component. A Sankey
diagram visualizes _flows_ — where quantities split, merge, and move between
stages — making it ideal for budgets, cash-flow, energy/material flows, and
conversion funnels.

- **No runtime dependencies** beyond Angular — no D3, no charting library.
- **Standalone + signals**, Angular 22.
- **Zero consumer configuration**: light/dark empty-state placeholders ship
  inline (CSS data-URIs), so there's nothing to add to your `angular.json`.
- **Interactive**: hover to trace a flow's chain, and optionally edit node
  names/values, re-point or re-value links, and add new flows in place.

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
  // `dataSource` is a two-way binding: in-place edits write an immutable copy
  // back through it, keeping `flows` in sync.
  template: `
    <allomoney-sankey-diagram
      [(dataSource)]="flows"
      [options]="{ theme: 'dark', currency: 'USD' }" />
  `,
})
export class App {
  readonly flows = signal<SankeyData>({
    nodes: [
      { id: 0, name: 'Income' },
      { id: 1, name: 'Rent' },
      { id: 2, name: 'Savings' },
    ],
    links: [
      { source: 0, target: 1, value: 1200 },
      { source: 0, target: 2, value: 800 },
    ],
  });
}
```

When `dataSource` is empty, `null`, or omitted — or every node is invalid — the
component renders a themed **empty state** instead of a diagram. Every rejected
node/link is logged to the console.

## Theming

Pass `theme="light"` / `theme="dark"` (or the `options` form
`[options]="{ theme: 'dark' }"`, which wins if both are set), or set a
library-wide default via `provideAlloMoneyLibrary({ defaultTheme })`. The
light/dark empty-state placeholders are **embedded inline** in the component's
CSS as data-URIs — **zero configuration required**, nothing to copy into your
build.

## API

### `AllomoneySankeyDiagram` — inputs

| Input | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `dataSource` | `SankeyData \| null \| undefined` | `undefined` | Nodes + links to render. Empty/`null`/`undefined` shows the empty state. **Two-way** (`[(dataSource)]`): in-place edits write an immutable copy back. |
| `options` | `SankeyOptions` | `{}` | Presentation options and edit flags, kept separate from the graph. Any field set here overrides the matching element input below. |
| `theme` | `'light' \| 'dark'` | config `defaultTheme` | Visual theme; also selects the light/dark empty-state placeholder. |
| `currency` | `string \| null` | `null` | ISO 4217 code; formats node/link values as currency, else plain 2-decimal numbers. An unknown code falls back to the plain format. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Flow direction. |
| `width` / `height` | `number \| null` | `null` (100% of container) | Rendered size in CSS pixels. Invalid or display-distorting values are ignored (logged) and the default size is used. |
| `noDataMessage` | `string` | `'No Data'` | Message shown in the empty state. Rendered as auto-escaped text. |
| `maxDisplayedNodeName` | `number` | `17` | Max characters of a node name shown on the diagram; longer names are truncated with `…` (the full name stays available to assistive tech). |
| `legend` | `SankeyLegend \| null` | shown, `'bottom'` | Legend configuration (see below). A partial value fills only its missing fields. |
| `canEditNodeName` / `canEditNodeValue` | `boolean` | `false` | Allow editing a node's name / value by double-click. |
| `canEditLinkValue` / `canEditLinkSource` / `canEditLinkTarget` | `boolean` | `false` | Allow editing a link's value / re-pointing its source / target by double-click. |
| `canAddLink` | `boolean` | `false` | Allow adding a new flow from a node (its editor gains a "Source for" action). |
| `canAggregateLinks` | `boolean` | `true` | Merge parallel links (same source and target) into one summed ribbon. An aggregated ribbon's derived value cannot be edited in place. |
| `hideLinkValue` | `boolean` | `true` | Hide each flow's on-diagram value label. Does not affect the hover tooltip, which still reports the value. |

Every field in `options` can also be set as the matching element input (the
cases above). When both are supplied for the same field, the **`options` value
wins**. Two fields are **`options`-only** (no element input):

| `options` field | Type | Default | Description |
| --------------- | ---- | ------- | ----------- |
| `horizontalScrolling` | `boolean` | `true` | `true` keeps the diagram's natural width (scrolling horizontally when it overflows) so elements stay legible; `false` scales it down to fit the container width. |
| `verticalScrolling` | `boolean` | `true` | As above, for the vertical axis. |

### Sizing

By default the diagram fills **100% of its container** on both axes. Set `width`
and/or `height` (CSS pixels) to pin a fixed size. Each must be a positive number
of at least **200px**, and when both are given their ratio must stay reasonably
close to the diagram's natural proportions; a value that is invalid or would
significantly distort the display is **ignored, an error is logged to the
console, and the diagram renders at its default size**.

### Legend

The legend (`SankeyLegend`) lists each node with a colour swatch. A node
duplicated by a circular flow contributes one extra dashed "ghost" swatch per
duplicate, matching how it is drawn on the diagram.

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `visibility` | `boolean` | `true` | Whether the legend is shown. |
| `location` | `'left' \| 'top' \| 'right' \| 'bottom'` | `'bottom'` | Where the legend sits relative to the diagram. |
| `isFullLegendShown` | `boolean` | `false` | When `true`, also show each node's total incoming/outgoing sums. |
| `inLabel` / `outLabel` | `string` | `'Deposit'` / `'Withdrawal'` | Labels for the incoming/outgoing totals in the full legend. Empty/whitespace falls back to the default. |

### Two-way binding

`dataSource` is a `model`, so in-place editing writes an **immutable copy** back
through it. Use `[(dataSource)]` to keep your signal in sync, or bind
`(dataSourceChange)` explicitly to observe edits without owning the data.

### Exported types

`SankeyData`, `SankeyOptions`, `SankeyNode`, `SankeyLink`, `SankeyTheme`,
`SankeyOrientation`, `SankeyLegend`, `LegendLocation`, `AlloMoneyLibraryConfig`,
`ResolvedAlloMoneyLibraryConfig`.

Exported values: `provideAlloMoneyLibrary`, `ALLOMONEY_LIBRARY_CONFIG`,
`DEFAULT_ALLOMONEY_LIBRARY_CONFIG`.

## Compatibility

- **Angular 22** (`@angular/core` and `@angular/common` `^22.0.0`).

## License

[MIT](./LICENSE)
