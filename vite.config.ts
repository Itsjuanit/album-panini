import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

const BUILD_INFO = `gemini-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;

export default defineConfig({
	define: {
		__BUILD_INFO__: JSON.stringify(BUILD_INFO)
	},
	server: {
		port: 4280,
		strictPort: true,
		host: true
	},
	preview: {
		port: 4280,
		strictPort: true
	},
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Álbum Panini Mundial 2026',
				short_name: 'Álbum 2026',
				description: 'Nuestro álbum personal del Mundial 2026',
				theme_color: '#1e3a8a',
				background_color: '#0b1220',
				display: 'standalone',
				orientation: 'portrait',
				start_url: '/',
				icons: [
					{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}'],
				skipWaiting: true,
				clientsClaim: true,
				cleanupOutdatedCaches: true
			}
		})
	]
});
