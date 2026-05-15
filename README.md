# Álbum Panini Mundial 2026 ⚽

Webapp personal para llevar el conteo de las figuritas del álbum Panini del Mundial 2026.

- 980 figuritas precargadas (48 selecciones × 20 + 20 intro)
- Sacar foto a cada figu desde el celu
- Notas y log de canjes por figurita
- Funciona offline (PWA — se instala en pantalla de inicio)
- Datos guardados local en el navegador (IndexedDB), con export/import JSON

## Stack

SvelteKit + TypeScript · Vite · Dexie (IndexedDB) · vite-plugin-pwa · adapter-static

## Desarrollo

```bash
npm install
npm run dev       # localhost:4280
npm run build
npm run preview
```

## Deploy

Pensado para Vercel (config en `vercel.json`). Al ser SPA estática también corre en cualquier hosting de archivos estáticos (Netlify, Cloudflare Pages, GitHub Pages) — apuntar al directorio `build/`.
