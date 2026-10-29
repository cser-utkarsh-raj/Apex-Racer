/**
 * PWA registration.
 *
 * There is deliberately no "install app" button: the manifest + service worker
 * make the game installable, and the browser decides when to offer it (Chrome's
 * install icon, Android's add-to-home-screen prompt, iOS's Share > Add to Home
 * Screen). `?nosw=1` skips registration for local QA.
 */

export function canRegisterServiceWorker(nav = typeof navigator !== 'undefined' ? navigator : null,
    loc = typeof location !== 'undefined' ? location : null) {
    if (!nav || !loc) return false;
    if (!('serviceWorker' in nav)) return false;
    return loc.protocol === 'https:' || loc.protocol === 'http:';
}

export function registerServiceWorker({
    url = 'sw.js',
    scope = './',
    search = '',
    nav = typeof navigator !== 'undefined' ? navigator : null,
    loc = typeof location !== 'undefined' ? location : null,
    logger = console
} = {}) {
    let params = null;
    try { params = new URLSearchParams(search); } catch { params = null; }
    if (params && params.get('nosw') === '1') return Promise.resolve(null);
    if (!canRegisterServiceWorker(nav, loc)) return Promise.resolve(null);

    return nav.serviceWorker.register(url, { scope })
        .catch((error) => {
            if (logger && typeof logger.warn === 'function') {
                logger.warn('[PWA] Service worker registration failed:', error && error.message);
            }
            return null;
        });
}

/**
 * URLs the page has already fetched (scripts, styles, textures, world tiles,
 * CDN modules). The service worker uses this to fill its runtime cache, so an
 * offline relaunch of a visited world works even though the first page load
 * happened before the worker took control.
 */
export function collectResourceUrls({
    perf = typeof performance !== 'undefined' ? performance : null
} = {}) {
    if (!perf || typeof perf.getEntriesByType !== 'function') return [];
    return perf.getEntriesByType('resource')
        .map((entry) => entry && entry.name)
        .filter((name) => typeof name === 'string' && /^https?:\/\//.test(name));
}

/**
 * Ask the active service worker to cache the given URLs (or everything the
 * page has loaded so far).
 * @returns {Promise<number>} number of URLs handed over
 */
export function warmRuntimeCache({
    registration = null,
    urls = null,
    nav = typeof navigator !== 'undefined' ? navigator : null
} = {}) {
    if (!nav || !nav.serviceWorker) return Promise.resolve(0);
    const list = Array.isArray(urls) ? urls : collectResourceUrls();
    if (list.length === 0) return Promise.resolve(0);

    const send = (reg) => {
        const worker = reg && (reg.active || reg.waiting || reg.installing);
        if (!worker) return 0;
        worker.postMessage({ type: 'WARM', urls: list });
        return list.length;
    };

    if (registration) return Promise.resolve(send(registration));
    return nav.serviceWorker.ready.then(send).catch(() => 0);
}

/** Register once the page is idle so the first drive is not competing with it. */
export function registerWhenReady(options = {}) {
    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    if (!doc || !win) return Promise.resolve(null);

    const start = () => registerServiceWorker(options);
    if (doc.readyState === 'complete') return start();
    return new Promise((resolve) => {
        win.addEventListener('load', () => resolve(start()), { once: true });
    });
}
