// Setup docsify for client side md rendering
import './docsify-conf';
import 'docsify';
import 'docsify/lib/plugins/search';

// Docsify loads the base prismjs, but needs some additional components
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-git';
import 'prismjs/components/prism-ruby';

// Local cache in a service worker for offline access
if (typeof navigator.serviceWorker !== 'undefined') {
    navigator.serviceWorker.register('doc-cache.js');
}
