import { InjectionToken } from '@angular/core';
import type { SankeyTheme } from '../allomoney-sankey-diagram/models/sankey-data';

/**
 * Library-wide configuration for AlloMoney Library.
 *
 * Every field is optional so that consumers can opt in incrementally. Provide
 * it via {@link provideAlloMoneyLibrary} rather than injecting the token
 * directly at bootstrap.
 */
export interface AlloMoneyLibraryConfig {
  /**
   * Default theme applied to components that do not receive an explicit
   * `theme` input. Defaults to `'light'`.
   */
  defaultTheme?: SankeyTheme;
}

/**
 * Fully-resolved configuration (no optional fields). This is what components
 * inject; {@link provideAlloMoneyLibrary} fills in any gaps with defaults.
 */
export type ResolvedAlloMoneyLibraryConfig = Required<AlloMoneyLibraryConfig>;

/** Built-in defaults used when a config value is not supplied by the consumer. */
export const DEFAULT_ALLOMONEY_LIBRARY_CONFIG: ResolvedAlloMoneyLibraryConfig = {
  defaultTheme: 'light',
};

/**
 * Injection token carrying the resolved AlloMoney Library configuration.
 *
 * Consumers should not provide this token directly — use
 * {@link provideAlloMoneyLibrary}. The `factory` guarantees a sensible default
 * even when the provider function is never called.
 */
export const ALLOMONEY_LIBRARY_CONFIG = new InjectionToken<ResolvedAlloMoneyLibraryConfig>(
  'ALLOMONEY_LIBRARY_CONFIG',
  {
    providedIn: 'root',
    factory: () => DEFAULT_ALLOMONEY_LIBRARY_CONFIG,
  },
);