import { Plugin } from './docsify-plugin';

/**
 * Docsify plugin to insert replace text strings prior to rendering.
 */
export const docsifyReplace: (search: RegExp, replacement: string) => Plugin
    = (re, x) =>
        h => h.beforeEach(c => c.replace(re, x));
