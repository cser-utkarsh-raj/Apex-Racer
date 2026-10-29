/**
 * Generate the service-worker precache list.
 *
 *   node tools/make-precache.mjs
 *
 * Only the app shell is listed: HTML, the game's own modules, the manifest and
 * the small icon/texture set. World tiles and vehicle textures are cached the
 * first time they are actually used (the page sends the URLs it loaded to the
 * service worker), which keeps install light on phones.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'assets', 'pwa', 'precache.json');

const FIXED = [
    './',
    './index.html',
    './style.css',
    './manifest.webmanifest',
    './assets/manifest.json',
    './assets/pwa/icon-192.png',
    './assets/pwa/icon-512.png',
    './assets/pwa/icon-maskable-512.png',
    './assets/pwa/apple-touch-icon-180.png'
];

function walk(dir, filter) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, filter));
        else if (filter(full)) out.push(full);
    }
    return out;
}

const toUrl = (file) => './' + path.relative(ROOT, file).split(path.sep).join('/');

const urls = new Set(FIXED);

// Every game module, so an offline launch can resolve the import graph.
for (const file of walk(path.join(ROOT, 'src'), (f) => f.endsWith('.js'))) {
    urls.add(toUrl(file));
}

// World manifests are tiny and needed to open the world picker offline.
for (const file of walk(path.join(ROOT, 'assets', 'worlds'), (f) => f.endsWith('manifest.json'))) {
    urls.add(toUrl(file));
}

// Shared vehicle textures (the processed library is far too large to precache).
for (const file of walk(path.join(ROOT, 'assets', 'textures'), (f) => f.endsWith('.png'))) {
    urls.add(toUrl(file));
}

const list = [...urls].sort();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(list, null, 2) + '\n');
console.log(`wrote assets/pwa/precache.json (${list.length} entries)`);
