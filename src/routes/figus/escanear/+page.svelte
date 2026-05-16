<script lang="ts">
	import { db, setStatus } from '$lib/db';
	import { recognizeSticker } from '$lib/ocr';
	import { identifyWithAI, type IdentifyResult } from '$lib/identify';
	import { goto } from '$app/navigation';
	import { fly, scale, fade } from 'svelte/transition';

	type Phase = 'idle' | 'processing' | 'result' | 'no-match';

	let phase = $state<Phase>('idle');
	let previewUrl = $state<string | undefined>();
	let result = $state<IdentifyResult | undefined>();

	async function onCapture(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(file);
		phase = 'processing';
		try {
			result = await identifyWithAI(file);
		} catch (err) {
			console.error('AI identify failed, trying OCR fallback:', err);
			try {
				const stickers = await db.stickers.toArray();
				const ocr = await recognizeSticker(file, stickers);
				result = {
					rawText: ocr.rawText,
					matches: ocr.matches,
					bestMatch: ocr.bestMatch,
					confidence: ocr.confidence,
					source: 'ocr'
				};
			} catch (err2) {
				console.error(err2);
				result = { rawText: String(err), matches: [], confidence: 'none', source: 'ocr' };
			}
		}
		phase = (result?.matches.length ?? 0) > 0 ? 'result' : 'no-match';
	}

	async function pickMatch(stickerId: number, markOwned = true) {
		if (markOwned) {
			const st = await db.states.get(stickerId);
			if (st?.status === 'missing') await setStatus(stickerId, 'owned');
		}
		goto(`/figus/${stickerId}`);
	}

	function reset() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = undefined;
		result = undefined;
		phase = 'idle';
	}
</script>

<button class="back" onclick={() => history.back()}>← Volver</button>

<div class="hero" in:fly={{ y: 15, duration: 300 }}>
	<div class="ico">📷</div>
	<h1>Escanear figurita</h1>
	<p>Apuntá a la figu — la AI lee el código del país (ej: <code>ARG 17</code>) y la encuentra sola</p>
</div>

{#if phase === 'idle'}
	<label class="big-btn" in:scale={{ duration: 250, start: 0.95 }}>
		<span class="b-ico">📸</span>
		<span class="b-label">Sacar foto</span>
		<input type="file" accept="image/*" capture="environment" onchange={onCapture} hidden />
	</label>

	<div class="tips" in:fly={{ y: 10, duration: 300, delay: 100 }}>
		<p class="t-title">Tips para que salga bien:</p>
		<ul>
			<li>📏 Acercá la figu — que ocupe casi toda la foto</li>
			<li>💡 Buena luz, sin reflejos sobre la figu</li>
			<li>🔢 Que se vea bien el número de abajo</li>
		</ul>
	</div>
{/if}

{#if phase === 'processing'}
	<div class="processing" in:fade>
		{#if previewUrl}
			<img src={previewUrl} alt="Foto" />
		{/if}
		<div class="loader">
			<div class="dot"></div>
			<div class="dot"></div>
			<div class="dot"></div>
		</div>
		<p>Buscando el número de la figurita…</p>
		<small>La primera vez tarda un toque más (descarga el motor OCR)</small>
	</div>
{/if}

{#if phase === 'result' && result}
	<div class="result-card" in:fly={{ y: 15, duration: 300 }}>
		{#if previewUrl}
			<div class="thumb"><img src={previewUrl} alt="Foto" /></div>
		{/if}

		{#if result.confidence === 'high' && result.bestMatch}
			{@const s = result.bestMatch}
			<div class="match" in:scale={{ start: 0.85, duration: 350 }}>
				<div class="big-check">✅</div>
				<h2>¡La encontré!</h2>
				<div class="sticker-info">
					<span class="code">{s.code}</span>
					<span class="name">{s.team}</span>
					<span class="sub">{s.label}</span>
				</div>
				<div class="actions">
					<button class="primary" onclick={() => pickMatch(s.id, true)}>
						✓ La tengo, abrirla
					</button>
					<button class="ghost" onclick={reset}>Escanear otra</button>
				</div>
			</div>
		{:else}
			<div class="multi">
				<h2>🤔 Encontré varias</h2>
				<p class="hint">¿Cuál es?</p>
				<ul class="candidates">
					{#each result.matches as s, i (s.id)}
						<li in:fly|local={{ x: -10, duration: 200, delay: i * 50 }}>
							<button onclick={() => pickMatch(s.id, true)}>
								<span class="code">{s.code}</span>
								<div class="info">
									<span class="name">{s.team}</span>
									<span class="sub">{s.label}</span>
								</div>
								<span class="arrow">›</span>
							</button>
						</li>
					{/each}
				</ul>
				<button class="ghost" onclick={reset}>Escanear de nuevo</button>
			</div>
		{/if}
	</div>
{/if}

{#if phase === 'no-match'}
	<div class="no-match-card" in:fly={{ y: 15, duration: 300 }}>
		{#if previewUrl}
			<div class="thumb"><img src={previewUrl} alt="Foto" /></div>
		{/if}
		<div class="big-icon">😕</div>
		<h2>No pude leer el número</h2>
		{#if result?.rawText}
			<p class="hint">Lo que llegué a leer fue:</p>
			<pre class="raw">{result.rawText.trim() || '(nada)'}</pre>
		{/if}
		<div class="actions">
			<button class="primary" onclick={reset}>📸 Intentar otra foto</button>
			<a class="ghost" href="/figus">Buscar a mano</a>
		</div>
	</div>
{/if}

<style>
	.back {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 0.95rem;
		padding: 0.4rem 0;
		cursor: pointer;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}

	.hero {
		text-align: center;
		padding: 0.5rem 0 1rem;
	}
	.ico {
		font-size: 3rem;
		margin-bottom: 0.4rem;
		filter: drop-shadow(0 4px 12px rgba(251, 191, 36, 0.4));
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 900;
		letter-spacing: -0.5px;
		background: linear-gradient(135deg, #fbbf24, #22c55e);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.hero p {
		color: var(--muted);
		font-size: 0.88rem;
		margin: 0.4rem 0 0;
	}
	code {
		background: rgba(255, 255, 255, 0.08);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.8rem;
		color: var(--gold);
	}

	.big-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 2.4rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-radius: 20px;
		cursor: pointer;
		font-weight: 900;
		font-size: 1.1rem;
		box-shadow: 0 12px 32px rgba(251, 191, 36, 0.4);
		transition: transform 0.15s;
		margin-top: 0.5rem;
	}
	.big-btn:active { transform: scale(0.97); }
	.b-ico { font-size: 3rem; }
	.b-label { letter-spacing: 0.5px; }

	.tips {
		margin-top: 1.2rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.9rem;
	}
	.t-title {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 1px;
	}
	.tips ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.tips li {
		font-size: 0.88rem;
	}

	.processing {
		text-align: center;
		padding: 1rem 0;
	}
	.processing img {
		width: 100%;
		max-height: 240px;
		object-fit: contain;
		border-radius: 14px;
		background: #000;
		margin-bottom: 1rem;
		border: 3px solid var(--gold);
	}
	.processing p { margin: 0; font-weight: 600; }
	.processing small { color: var(--muted); font-size: 0.8rem; display: block; margin-top: 0.4rem; }
	.loader {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 0.7rem;
	}
	.dot {
		width: 12px; height: 12px;
		background: var(--gold);
		border-radius: 50%;
		animation: pulse 1.2s ease-in-out infinite;
	}
	.dot:nth-child(2) { animation-delay: 0.15s; background: var(--good); }
	.dot:nth-child(3) { animation-delay: 0.3s; background: var(--accent-2); }
	@keyframes pulse {
		0%, 100% { transform: scale(0.6); opacity: 0.5; }
		50% { transform: scale(1.1); opacity: 1; }
	}

	.result-card, .no-match-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: 1rem;
	}
	.thumb {
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 1rem;
		max-height: 160px;
		border: 2px solid var(--border);
	}
	.thumb img {
		width: 100%;
		max-height: 160px;
		object-fit: contain;
		display: block;
		background: #000;
	}

	.match { text-align: center; }
	.big-check { font-size: 4rem; animation: pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
	.big-icon { font-size: 3.5rem; text-align: center; margin: 0.5rem 0; }
	@keyframes pop-in {
		0% { transform: scale(0) rotate(-180deg); opacity: 0; }
		100% { transform: scale(1) rotate(0); opacity: 1; }
	}
	h2 {
		margin: 0.4rem 0;
		font-size: 1.4rem;
		font-weight: 900;
		text-align: center;
	}
	.sticker-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 1rem;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(251, 191, 36, 0.08));
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 14px;
		margin: 1rem 0;
	}
	.code {
		font-size: 0.75rem;
		color: var(--gold);
		font-weight: 800;
		letter-spacing: 2px;
	}
	.name { font-size: 1.3rem; font-weight: 800; }
	.sub { color: var(--muted); font-size: 0.9rem; }

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.primary, .ghost {
		padding: 0.85rem;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		text-decoration: none;
		text-align: center;
		display: block;
	}
	.primary {
		background: linear-gradient(135deg, #22c55e, #16a34a);
		color: white;
		box-shadow: 0 6px 16px rgba(34, 197, 94, 0.3);
	}
	.primary:active { transform: scale(0.98); }
	.ghost {
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--border);
	}

	.multi h2 { text-align: center; }
	.multi .hint { color: var(--muted); text-align: center; font-size: 0.88rem; margin: 0.2rem 0 0.7rem; }
	.candidates { list-style: none; padding: 0; margin: 0 0 0.8rem; display: flex; flex-direction: column; gap: 0.4rem; }
	.candidates button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.7rem 0.9rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 12px;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}
	.candidates button:hover { border-color: var(--gold); }
	.candidates button:active { transform: scale(0.98); }
	.candidates .info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.candidates .arrow { color: var(--muted); font-size: 1.4rem; }

	.no-match-card { text-align: center; }
	.raw {
		background: var(--card-solid);
		padding: 0.6rem;
		border-radius: 8px;
		color: var(--muted);
		font-size: 0.85rem;
		text-align: left;
		overflow-x: auto;
		margin: 0.4rem 0 1rem;
		max-height: 120px;
	}
	.no-match-card .hint { color: var(--muted); margin: 0.5rem 0 0.3rem; font-size: 0.85rem; }
</style>
