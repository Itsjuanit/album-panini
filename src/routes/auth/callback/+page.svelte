<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { auth } from '$lib/auth.svelte';

	let phase = $state<'processing' | 'error'>('processing');
	let errMsg = $state<string | undefined>();

	onMount(async () => {
		const params = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.search);
		const code = new URLSearchParams(location.search).get('code');

		try {
			if (code) {
				const { error } = await supabase.auth.exchangeCodeForSession(code);
				if (error) throw error;
			} else {
				const { data, error } = await supabase.auth.getSession();
				if (error || !data.session) throw error ?? new Error('Sesión no encontrada');
			}
			await auth.init();
			goto('/?welcome=1', { replaceState: true });
		} catch (e: unknown) {
			console.error(e);
			errMsg = (e as Error)?.message ?? 'Error desconocido';
			phase = 'error';
		}
	});
</script>

<div class="wrap">
	{#if phase === 'processing'}
		<div class="loader">
			<div class="ball">⚽</div>
			<p>Iniciando sesión…</p>
		</div>
	{:else}
		<div class="error">
			<div class="ico">⚠️</div>
			<h2>No pude iniciar sesión</h2>
			{#if errMsg}<p class="msg">{errMsg}</p>{/if}
			<a href="/login" class="btn">Probar de nuevo</a>
		</div>
	{/if}
</div>

<style>
	.wrap {
		min-height: calc(100dvh - 4rem);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.loader { text-align: center; }
	.ball {
		font-size: 3.5rem;
		animation: spin 1.2s linear infinite;
		display: inline-block;
		margin-bottom: 0.6rem;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	.loader p { color: var(--muted); margin: 0; font-weight: 600; }

	.error {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1.5rem;
		text-align: center;
		max-width: 380px;
	}
	.ico { font-size: 2.5rem; margin-bottom: 0.4rem; }
	.error h2 { margin: 0 0 0.5rem; }
	.msg { color: var(--bad); font-size: 0.88rem; background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 8px; }
	.btn {
		display: inline-block;
		margin-top: 0.7rem;
		padding: 0.7rem 1.3rem;
		background: var(--accent);
		color: white;
		border-radius: 10px;
		text-decoration: none;
		font-weight: 700;
	}
</style>
