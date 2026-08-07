/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// ChordFlam offline caching (Phase 6 — Branding & PWA, plan §8).
// Precaches the built app shell + static assets on install, then serves a
// cache-first strategy for known assets and a network-falling-back-to-cache
// strategy for everything else, so a previously viewed song stays available
// offline. Single-user, no backend — this is purely a static asset cache.

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `chordflam-cache-${version}`;

// `build` = the app's JS/CSS output, `files` = everything in `static/`.
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}
	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	async function respond(): Promise<Response> {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// Precached build/static assets: serve straight from cache.
		if (ASSETS.includes(url.pathname)) {
			const cachedResponse = await cache.match(url.pathname);
			if (cachedResponse) return cachedResponse;
		}

		// Everything else: try the network first, fall back to cache (e.g. the
		// single-page shell) so the app still opens offline.
		try {
			const response = await fetch(event.request);
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}
			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}
			return response;
		} catch (err) {
			const cachedResponse = await cache.match(event.request);
			if (cachedResponse) return cachedResponse;
			throw err;
		}
	}

	event.respondWith(respond());
});
