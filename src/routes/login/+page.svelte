<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { fly, scale } from 'svelte/transition';
	import { onMount } from 'svelte';

	let email = $state('');
	let phase = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let error = $state<string | undefined>();

	onMount(async () => {
		await auth.init();
		if (auth.user) goto('/');
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = email.trim();
		if (!trimmed) return;
		phase = 'sending';
		error = undefined;
		const redirectTo = `${location.origin}/auth/callback`;
		const { error: err } = await auth.signInWithMagicLink(trimmed, redirectTo);
		if (err) {
			phase = 'error';
			error = err.message;
		} else {
			phase = 'sent';
		}
	}

	function reset() {
		phase = 'idle';
		error = undefined;
	}
</script>

<div class="wrap">
	<div class="card" in:scale={{ duration: 350, start: 0.92 }}>
		<div class="hero">
			<div class="ball">⚽</div>
			<h1>
				<span class="t1">ÁLBUM</span>
				<span class="t2">Mundial 2026</span>
			</h1>
			<p>Iniciá sesión con tu mail para guardar tu colección en la nube.</p>
		</div>

		{#if phase === 'sent'}
			<div class="sent" in:fly={{ y: 10, duration: 250 }}>
				<div class="big">📬</div>
				<h2>¡Te mandé un mail!</h2>
				<p>Abrí el correo en <strong>{email}</strong> y tocá el botón "Entrar".</p>
				<small>Revisá la carpeta de spam si no aparece en 1 minuto.</small>
				<button class="ghost" onclick={reset}>Usar otro mail</button>
			</div>
		{:else}
			<form onsubmit={send} class="form">
				<label>
					<span>Tu email</span>
					<input
						type="email"
						bind:value={email}
						placeholder="tu@email.com"
						autocomplete="email"
						required
						disabled={phase === 'sending'}
					/>
				</label>
				<button class="primary" type="submit" disabled={phase === 'sending' || !email.trim()}>
					{phase === 'sending' ? 'Enviando...' : 'Enviar link de acceso'}
				</button>
				{#if error}
					<p class="err">⚠️ {error}</p>
				{/if}
				<p class="hint">No hace falta password. Te llega un link al mail, lo tocás y entrás.</p>
			</form>
		{/if}
	</div>
</div>

<style>
	.wrap {
		min-height: calc(100dvh - 4rem);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 1.5rem;
		max-width: 420px;
		width: 100%;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}
	.hero {
		text-align: center;
		margin-bottom: 1.2rem;
	}
	.ball {
		font-size: 3rem;
		animation: bounce 2.2s ease-in-out infinite;
		display: inline-block;
		filter: drop-shadow(0 6px 16px rgba(251, 191, 36, 0.4));
	}
	@keyframes bounce {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		25% { transform: translateY(-8px) rotate(15deg); }
		50% { transform: translateY(0) rotate(0deg); }
		75% { transform: translateY(-4px) rotate(-10deg); }
	}
	h1 {
		margin: 0.4rem 0 0.4rem;
		line-height: 1;
	}
	.t1 {
		display: block;
		font-size: 0.75rem;
		letter-spacing: 4px;
		color: var(--gold);
		font-weight: 800;
		margin-bottom: 4px;
	}
	.t2 {
		display: block;
		font-size: 1.6rem;
		font-weight: 900;
		letter-spacing: -0.5px;
		background: linear-gradient(135deg, #fff, #c8e6c9);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.hero p {
		color: var(--muted);
		font-size: 0.92rem;
		margin: 0.6rem 0 0;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	label span {
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-weight: 700;
	}
	input {
		padding: 0.85rem 1rem;
		background: var(--card-solid);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
	}
	input:focus {
		outline: none;
		border-color: var(--gold);
		box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
	}
	.primary {
		padding: 0.95rem;
		border: none;
		border-radius: 12px;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		font-weight: 800;
		font-size: 1rem;
		cursor: pointer;
		font-family: inherit;
		box-shadow: 0 8px 24px rgba(251, 191, 36, 0.35);
		transition: transform 0.15s;
	}
	.primary:active { transform: scale(0.98); }
	.primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.hint {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0.2rem 0 0;
		text-align: center;
	}
	.err {
		color: var(--bad);
		font-size: 0.88rem;
		background: rgba(239, 68, 68, 0.1);
		padding: 0.5rem 0.7rem;
		border-radius: 8px;
		margin: 0;
	}

	.sent {
		text-align: center;
	}
	.sent .big {
		font-size: 3.5rem;
		margin-bottom: 0.5rem;
	}
	.sent h2 {
		margin: 0 0 0.6rem;
		font-size: 1.3rem;
		font-weight: 900;
	}
	.sent p { margin: 0 0 0.5rem; }
	.sent small { color: var(--muted); display: block; margin-bottom: 1rem; }
	.ghost {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--muted);
		padding: 0.6rem 1.2rem;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
	}
</style>
