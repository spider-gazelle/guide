import { Plugin } from './docsify-plugin';
import { docsifyReplace } from './docsify-replace';

/**
 * Site config to be picked up by docsify for rendering of site.
 */
(window as any).$docsify = {
    name: 'Spider-Gazelle Developer Guide',
    repo: 'spider-gazelle',
    themeColor: '#414858',
    homepage: 'getting-started/overview.md',
    coverpage: 'coverpage.md',
    loadNavbar: false,
    loadSidebar: '../../contents.md',
    subMaxLevel: 2,
    auto2top: true,
    search: {
        noData: `I couldn't find what you are looking for.`
    },
    markdown: {
        smartypants: true,
    },
    plugins: []
};
