<script lang="ts">
	import { ensureSeeded } from '$lib/db';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { auth } from '$lib/auth.svelte';
	import {
		pullFromCloud,
		cloudHasData,
		localHasMeaningfulData,
		pushAllLocalToCloud,
		clearLocalUserData,
		maybePendingCloudWipe
	} from '$lib/sync';

	let { children } = $props();
	let ready = $state(false);
	let migrationPrompt = $state<null | 'asking' | 'uploading' | 'done'>(null);
	let migrationKind = $state<'first-login' | null>(null);

	const isPublicRoute = $derived(
		page.url.pathname.startsWith('/login') || page.url.pathname.startsWith('/auth/')
	);

	let bootError = $state<string | undefined>();

	onMount(() => {
		const safety = setTimeout(() => {
			if (!ready) {
				bootError = 'Inicio tardando demasiado. Mostrando app de todos modos.';
				ready = true;
			}
		}, 12000);

		(async () => {
			try {
				await auth.init();
				await ensureSeeded();

				if (!auth.user) {
					if (!isPublicRoute) goto('/login');
					return;
				}

				try {
					await maybePendingCloudWipe();
				} catch (e) {
					console.error('Cloud wipe falló:', e);
				}

				const [hasCloud, hasLocal] = await Promise.all([
					cloudHasData().catch((e) => {
						console.error('cloudHasData falló:', e);
						return false;
					}),
					localHasMeaningfulData().catch(() => false)
				]);

				if (!hasCloud && hasLocal) {
					migrationPrompt = 'asking';
					migrationKind = 'first-login';
					return;
				}

				if (hasCloud) {
					try {
						await pullFromCloud();
					} catch (e) {
						console.error('pullFromCloud falló:', e);
					}
				}
			} catch (e) {
				console.error('onMount falló:', e);
				bootError = (e as Error)?.message ?? String(e);
			} finally {
				clearTimeout(safety);
				ready = true;
			}
		})();
	});

	async function migrate(upload: boolean) {
		migrationPrompt = 'uploading';
		try {
			if (upload) {
				await pushAllLocalToCloud();
			} else {
				await clearLocalUserData();
			}
			migrationPrompt = 'done';
			setTimeout(() => (migrationPrompt = null), 600);
		} catch (e) {
			console.error(e);
			migrationPrompt = null;
		}
	}

	async function logout() {
		if (!confirm('¿Cerrar sesión? Las fotos locales quedan en este celu.')) return;
		await auth.signOut();
		await clearLocalUserData();
		goto('/login');
	}
</script>

<svelte:head>
	<title>Álbum Panini Mundial 2026</title>
	<meta name="theme-color" content="#0b6b2e" />
</svelte:head>

<div class="app">
	<div class="stadium-bg" aria-hidden="true">
		<div class="orb orb-1"></div>
		<div class="orb orb-2"></div>
		<div class="orb orb-3"></div>
	</div>

	<header>
		<div class="header-inner">
			<div class="logo">
				<div class="ball" aria-hidden="true">
					<svg viewBox="0 0 40 40" width="34" height="34">
						<circle cx="20" cy="20" r="18" fill="white" stroke="#111" stroke-width="1.5" />
						<polygon points="20,10 26,14 24,21 16,21 14,14" fill="#111" />
						<polygon points="20,10 26,14 31,11 28,4 18,5" fill="white" stroke="#111" stroke-width="0.8" />
					</svg>
				</div>
				<div class="title">
					<span class="t1">ÁLBUM</span>
					<span class="t2">Mundial 2026</span>
				</div>
			</div>
			{#if auth.user && !isPublicRoute}
				<button class="user-btn" onclick={logout} title="Cerrar sesión">
					<span class="initial">{(auth.user.email ?? '?')[0].toUpperCase()}</span>
				</button>
			{/if}
		</div>
	</header>

	<main>
		{#if !ready}
			<div class="loading" in:fade>
				<div class="loader-ball" aria-hidden="true">⚽</div>
				<p>Armando el álbum…</p>
				<small class="boot-hint">Si tarda más de 10s, recargá con Ctrl+Shift+R</small>
			</div>
		{:else if migrationPrompt === 'asking'}
			<div class="migrate-card" in:fly={{ y: 15, duration: 300 }}>
				<div class="m-ico">📤</div>
				<h2>Tu primera vez en la nube</h2>
				<p>Detecté que ya tenías figus marcadas en este celu. ¿Subirlas a tu cuenta para que las puedas usar en otros dispositivos?</p>
				<div class="m-actions">
					<button class="primary" onclick={() => migrate(true)}>Sí, subir mis figus</button>
					<button class="ghost" onclick={() => migrate(false)}>No, empezar limpio</button>
				</div>
				<small>Las fotos quedan locales en este celu en ambos casos.</small>
			</div>
		{:else if migrationPrompt === 'uploading'}
			<div class="loading" in:fade>
				<div class="loader-ball">☁️</div>
				<p>Subiendo a la nube…</p>
			</div>
		{:else}
			{#if bootError}
				<div class="boot-err" in:fly={{ y: -10, duration: 200 }}>
					<strong>⚠️</strong> {bootError}
					<button onclick={() => (bootError = undefined)}>✕</button>
				</div>
			{/if}
			<div in:fade={{ duration: 250 }}>
				{@render children()}
			</div>
		{/if}
	</main>

	{#if auth.user && !isPublicRoute}
	<nav class="bottom-nav">
		<a href="/" class:active={page.url.pathname === '/'}>
			<span class="icon">📊</span>
			<span class="lbl">Resumen</span>
		</a>
		<a href="/figus" class:active={page.url.pathname.startsWith('/figus')}>
			<span class="icon">🃏</span>
			<span class="lbl">Figus</span>
		</a>
		<a href="/equipos" class:active={page.url.pathname.startsWith('/equipos')}>
			<span class="icon">🛡️</span>
			<span class="lbl">Equipos</span>
		</a>
		<a href="/canjes" class:active={page.url.pathname.startsWith('/canjes')}>
			<span class="icon">🔄</span>
			<span class="lbl">Canjes</span>
		</a>
	</nav>
	{/if}
</div>

<style>
	:global(:root) {
		--field-1: #0b6b2e;
		--field-2: #0a3d0a;
		--night: #0a1a2e;
		--gold: #fbbf24;
		--gold-2: #f59e0b;
		--ice: #f8fafc;
		--card: rgba(255, 255, 255, 0.06);
		--card-solid: #142035;
		--border: rgba(255, 255, 255, 0.12);
		--text: #f8fafc;
		--muted: #94a3b8;
		--good: #22c55e;
		--good-glow: rgba(34, 197, 94, 0.4);
		--warn: #f59e0b;
		--bad: #ef4444;
		--accent: #3b82f6;
		--accent-2: #06b6d4;
	}
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: var(--night);
		color: var(--text);
		font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
		-webkit-tap-highlight-color: transparent;
		overscroll-behavior: none;
		min-height: 100dvh;
	}
	:global(*) { box-sizing: border-box; }
	:global(button) { font-family: inherit; }

	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow-x: hidden;
	}

	.stadium-bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		background:
			radial-gradient(ellipse at top, #1a3a5c 0%, transparent 60%),
			radial-gradient(ellipse at bottom, var(--field-2) 0%, transparent 70%),
			linear-gradient(180deg, var(--night) 0%, #0a2540 50%, var(--field-2) 100%);
	}
	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(80px);
		opacity: 0.35;
		animation: float 18s ease-in-out infinite;
	}
	.orb-1 {
		width: 280px; height: 280px;
		background: var(--good);
		top: -80px; left: -80px;
	}
	.orb-2 {
		width: 220px; height: 220px;
		background: var(--gold);
		top: 30%; right: -80px;
		animation-delay: -6s;
	}
	.orb-3 {
		width: 320px; height: 320px;
		background: var(--accent);
		bottom: -120px; left: 20%;
		animation-delay: -12s;
	}
	@keyframes float {
		0%, 100% { transform: translate(0, 0) scale(1); }
		33% { transform: translate(30px, -40px) scale(1.1); }
		66% { transform: translate(-20px, 30px) scale(0.95); }
	}

	header {
		padding: 0.9rem 1rem;
		background: linear-gradient(135deg, rgba(11, 107, 46, 0.9), rgba(10, 26, 46, 0.9));
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 10;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	.header-inner {
		max-width: 720px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.user-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid var(--gold);
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		font-weight: 900;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.95rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s;
	}
	.user-btn:active { transform: scale(0.92); }
	.initial { line-height: 1; }

	.migrate-card {
		background: var(--card);
		border: 1px solid var(--gold);
		border-radius: 18px;
		padding: 1.5rem;
		text-align: center;
		max-width: 420px;
		margin: 2rem auto 0;
		box-shadow: 0 20px 40px rgba(251, 191, 36, 0.15);
	}
	.m-ico { font-size: 3rem; margin-bottom: 0.4rem; }
	.migrate-card h2 { margin: 0 0 0.7rem; font-size: 1.3rem; font-weight: 900; }
	.migrate-card p { color: var(--muted); font-size: 0.92rem; margin: 0 0 1rem; }
	.m-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}
	.m-actions .primary {
		padding: 0.85rem;
		border: none;
		border-radius: 12px;
		background: linear-gradient(135deg, #22c55e, #16a34a);
		color: white;
		font-weight: 800;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.95rem;
	}
	.m-actions .ghost {
		padding: 0.7rem;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.9rem;
	}
	.migrate-card small { color: var(--muted); font-size: 0.78rem; }
	.logo {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.ball {
		display: flex;
		animation: bounce 2.2s ease-in-out infinite;
		filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
	}
	@keyframes bounce {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		25% { transform: translateY(-6px) rotate(15deg); }
		50% { transform: translateY(0) rotate(0deg); }
		75% { transform: translateY(-3px) rotate(-10deg); }
	}
	.title {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}
	.t1 {
		font-size: 0.7rem;
		letter-spacing: 3px;
		color: var(--gold);
		font-weight: 800;
	}
	.t2 {
		font-size: 1.15rem;
		font-weight: 900;
		letter-spacing: -0.3px;
		background: linear-gradient(90deg, #fff, #c8e6c9);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		margin-top: 2px;
	}

	main {
		flex: 1;
		padding: 1rem;
		padding-bottom: 6rem;
		max-width: 720px;
		width: 100%;
		margin: 0 auto;
	}

	.loading {
		text-align: center;
		color: var(--muted);
		padding: 3rem 0;
	}
	.loader-ball {
		font-size: 3rem;
		animation: spin-bounce 1.4s ease-in-out infinite;
		display: inline-block;
	}
	.boot-hint {
		display: block;
		margin-top: 0.7rem;
		color: var(--muted);
		font-size: 0.78rem;
		opacity: 0.7;
	}
	.boot-err {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid var(--bad);
		border-radius: 10px;
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.boot-err button {
		margin-left: auto;
		background: transparent;
		border: none;
		color: var(--text);
		cursor: pointer;
		font-size: 1rem;
	}
	@keyframes spin-bounce {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		50% { transform: translateY(-20px) rotate(180deg); }
	}

	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(10, 26, 46, 0.85);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: space-around;
		padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
		z-index: 10;
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
	}
	.bottom-nav a {
		color: var(--muted);
		text-decoration: none;
		font-size: 0.68rem;
		padding: 0.4rem 0.5rem;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		min-width: 60px;
		font-weight: 600;
		flex: 1;
		max-width: 100px;
	}
	.bottom-nav a .icon {
		font-size: 1.3rem;
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.bottom-nav a.active {
		color: var(--gold);
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(11, 107, 46, 0.25));
	}
	.bottom-nav a.active .icon {
		transform: scale(1.2) translateY(-2px);
	}
	.bottom-nav a:not(.active):active .icon {
		transform: scale(0.85);
	}
</style>
