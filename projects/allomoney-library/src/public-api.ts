/*
 * Public API Surface of allomoney-library
 *
 * This is the ONLY re-export barrel for the library. Every symbol exported
 * here is a semver contract. Nothing under any `internal/` folder may be
 * exported from this file.
 */

// Component
export { AllomoneySankeyDiagram } from './lib/allomoney-sankey-diagram/allomoney-sankey-diagram';

// Public data model
export type {
  SankeyData,
  SankeyOptions,
  SankeyNode,
  SankeyLink,
  SankeyTheme,
  SankeyOrientation,
  SankeyLegend,
  LegendLocation,
} from './lib/allomoney-sankey-diagram/models/sankey-data';

// Configuration
export { provideAlloMoneyLibrary } from './lib/config/provide-allomoney-library';
export {
  ALLOMONEY_LIBRARY_CONFIG,
  DEFAULT_ALLOMONEY_LIBRARY_CONFIG,
} from './lib/config/allomoney-library-config';
export type {
  AlloMoneyLibraryConfig,
  ResolvedAlloMoneyLibraryConfig,
} from './lib/config/allomoney-library-config';