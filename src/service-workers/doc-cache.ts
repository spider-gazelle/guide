const sw = self as ServiceWorkerGlobalScope;

const CACHE_NAME = 'aca-docs';

const WHITELIST = [
    sw.location.hostname,
    'fonts.gstatic.com',
    'fonts.googleapis.com'
];

const BLACKLIST = [
    'localhost'        // Disable cache for local dev
];

type Predicate<T> = (x: T) => boolean;

const isIn = <T>(xs: T[]) => (x: T) => xs.indexOf(x) > -1;

const checkAll = <T>(...p: Array<Predicate<T>>) => (x: T) => p.every(f => f(x));

const useCache = checkAll<URL>(
    url => isIn(WHITELIST)(url.hostname),
    url => !isIn(BLACKLIST)(url.hostname)
);

/**
 * Map a request object to a cache busted URL that can be passed to fetch.
 */
const getFixedUrl = (req: Request) => {
    const url = new URL(req.url);

    url.protocol = self.location.protocol;

    // FIXME remove when { cache: 'no-store' } is properly supported by fetch.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=453190
    if (url.hostname === self.location.hostname) {
        url.search += `${url.search ? '&' : '?'}cache-bust=${Date.now()}`;
    }

    return url.href;
};

/**
 * Fetch a resource, bypassing any browser caching.
 */
const fetchAlways = (r: Request) =>
    fetch(getFixedUrl(r), { cache: 'no-store' });

sw.addEventListener('activate', event => {
    event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    if (useCache(requestUrl)) {
        const cached = caches.match(event.request);
        const fetched = fetchAlways(event.request);
        const fetchedCopy = fetched.then(resp => resp.clone());

        // Call respondWith() with:
        // 1. the fetched resource
        // 2. a previously cached asset if the fetch failed (i.e. offline)
        // 3. a rejected promise (offline and not cached)
        event.respondWith(
            fetched.catch(() => cached || Promise.reject('offline'))
        );

        // Update the cache with the version we fetched (only for ok status)
        event.waitUntil(
            Promise.all([fetchedCopy, caches.open(CACHE_NAME)])
                .then(([response, cache]) =>
                    response.ok
                        ? cache.put(event.request, response)
                        : undefined
                )
                .catch(() => { /* ignore fetch errors */ })
        );
    }
});
