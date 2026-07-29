import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import {
  ALLOMONEY_LIBRARY_CONFIG,
  DEFAULT_ALLOMONEY_LIBRARY_CONFIG,
  type AlloMoneyLibraryConfig,
} from './allomoney-library-config';

/**
 * Configures AlloMoney Library for an application.
 *
 * Add it to the `providers` array of `bootstrapApplication` (or any
 * environment injector). This is the modern, tree-shakable alternative to an
 * `NgModule.forRoot()` and returns {@link EnvironmentProviders}.
 *
 * @example
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [
 *     provideAlloMoneyLibrary({ defaultTheme: 'dark' }),
 *   ],
 * });
 * ```
 *
 * @param config Partial configuration. Any omitted field falls back to the
 *   library defaults in {@link DEFAULT_ALLOMONEY_LIBRARY_CONFIG}.
 */
export function provideAlloMoneyLibrary(
  config: AlloMoneyLibraryConfig = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ALLOMONEY_LIBRARY_CONFIG,
      useValue: {
        ...DEFAULT_ALLOMONEY_LIBRARY_CONFIG,
        ...config,
      },
    },
  ]);
}