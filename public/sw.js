// Kill-switch service worker.
// Existing installs of older SWs will check this file on their next page load,
// see the new content, install this version, then on activate it deletes all
// caches, unregisters itself, and reloads any controlled clients — so phones
// that were stuck on a stale cached bundle will self-heal.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
        } catch (_) { /* ignore */ }

        try {
            await self.registration.unregister();
        } catch (_) { /* ignore */ }

        try {
            const clientsList = await self.clients.matchAll({ type: 'window' });
            for (const client of clientsList) {
                client.navigate(client.url);
            }
        } catch (_) { /* ignore */ }
    })());
});

// Pass through every fetch — no caching, no interception.
