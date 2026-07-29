import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAlloMoneyLibrary } from 'allomoney-library';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Exercises the real public API surface (resolved via the tsconfig path
    // alias -> dist/allomoney-library).
    provideAlloMoneyLibrary({ defaultTheme: 'light' }),
  ],
};