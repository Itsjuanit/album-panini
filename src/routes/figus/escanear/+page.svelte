<script lang="ts">
	import { db, setStatus } from '$lib/db';
	import { recognizeSticker } from '$lib/ocr';
	import { identifyWithAI, type IdentifyResult } from '$lib/identify';
	import { goto } from '$app/navigation';
	import { fly, scale, fade } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';

	type Phase = 'idle' | 'camera' | 'processing' | 'result' | 'no-match';

	let phase = $state<Phase>('idle');
	let previewUrl = $state<string | undefined>();
	let result = $state<IdentifyResult | undefined>();
	let manualCode = $state('');
	let manualError = $state<string | undefined>();

	let videoEl = $state<HTMLVideoElement | undefined>();
	let viewfinderEl = $state<HTMLDivElement | undefined>();
	let stream = $state<MediaStream | undefined>();
	let cameraError = $state<string | undefined>();
	let torchOn = $state(false);

	async function startCamera() {
		cameraError = undefined;
		phase = 'camera';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 1920 },
					height: { ideal: 1080 }
				},
				audio: false
			});
			await new Promise((r) => setTimeout(r, 50));
			if (videoEl) {
				videoEl.srcObject = stream;
				await videoEl.play().catch(() => {});
			}
		} catch (e) {
			console.error(e);
			cameraError = (e as Error)?.message ?? 'No se pudo abrir la cámara';
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = undefined;
		torchOn = false;
	}

	async function toggleTorch() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
		if (!capabilities?.torch) {
			cameraError = 'Tu celu no permite controlar la linterna desde la web';
			setTimeout(() => (cameraError = undefined), 2500);
			return;
		}
		try {
			torchOn = !torchOn;
			await track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] });
		} catch (e) {
			console.error(e);
		}
	}

	async function captureFromVideo() {
		if (!videoEl || !viewfinderEl) return;
		const video = videoEl;
		const vw = video.videoWidth;
		const vh = video.videoHeight;
		if (!vw || !vh) return;

		const videoRect = video.getBoundingClientRect();
		const finderRect = viewfinderEl.getBoundingClientRect();

		const videoAspect = vw / vh;
		const containerAspect = videoRect.width / videoRect.height;

		let displayedW = videoRect.width;
		let displayedH = videoRect.height;
		let offsetX = 0;
		let offsetY = 0;

		if (videoAspect > containerAspect) {
			displayedH = videoRect.height;
			displayedW = displayedH * videoAspect;
			offsetX = (videoRect.width - displayedW) / 2;
		} else {
			displayedW = videoRect.width;
			displayedH = displayedW / videoAspect;
			offsetY = (videoRect.height - displayedH) / 2;
		}

		const finderXInVideo = finderRect.left - videoRect.left - offsetX;
		const finderYInVideo = finderRect.top - videoRect.top - offsetY;
		const scaleX = vw / displayedW;
		const scaleY = vh / displayedH;

		const cropX = Math.max(0, finderXInVideo * scaleX);
		const cropY = Math.max(0, finderYInVideo * scaleY);
		const cropW = Math.min(vw - cropX, finderRect.width * scaleX);
		const cropH = Math.min(vh - cropY, finderRect.height * scaleY);

		const padding = 0.15;
		const padX = cropW * padding;
		const padY = cropH * padding;
		const finalX = Math.max(0, cropX - padX);
		const finalY = Math.max(0, cropY - padY);
		const finalW = Math.min(vw - finalX, cropW + padX * 2);
		const finalH = Math.min(vh - finalY, cropH + padY * 2);

		const canvas = document.createElement('canvas');
		canvas.width = finalW;
		canvas.height = finalH;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(video, finalX, finalY, finalW, finalH, 0, 0, finalW, finalH);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', 0.95)
		);
		if (!blob) return;

		stopCamera();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(blob);
		await processBlob(blob);
	}

	async function processBlob(blob: Blob) {
		phase = 'processing';
		try {
			result = await identifyWithAI(blob);
		} catch (err) {
			console.error('AI identify failed, OCR fallback:', err);
			try {
				const stickers = await db.stickers.toArray();
				const ocr = await recognizeSticker(blob, stickers);
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

	async function onFileInput(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = URL.createObjectURL(file);
		await processBlob(file);
	}

	async function pickMatch(stickerId: number, markOwned = true) {
		if (markOwned) {
			const st = await db.states.get(stickerId);
			if (st?.status === 'missing') await setStatus(stickerId, 'owned');
		}
		goto(`/figus/${stickerId}`);
	}

	function reset() {
		stopCamera();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = undefined;
		result = undefined;
		manualCode = '';
		manualError = undefined;
		phase = 'idle';
	}

	async function submitManual() {
		manualError = undefined;
		const raw = manualCode.trim().toUpperCase();
		const m = raw.match(/^([A-Z]{3})[-\s]?(\d{1,3})$/) ?? raw.match(/^FWC[-\s]?(\d{1,3})$/);
		if (!m) {
			manualError = 'Formato esperado: ARG 17, BRA-05, FWC042';
			return;
		}
		let target: string;
		if (raw.startsWith('FWC')) {
			target = `FWC${(m[1] ?? '').padStart(3, '0')}`;
		} else {
			target = `${m[1]}-${(m[2] ?? '').padStart(2, '0')}`;
		}
		const stickers = await db.stickers.toArray();
		const found = stickers.find((s) => s.code.toUpperCase() === target);
		if (!found) {
			manualError = `No existe ${target} en el álbum`;
			return;
		}
		await pickMatch(found.id, true);
	}

	onDestroy(() => stopCamera());
</script>

<button class="back" onclick={() => { stopCamera(); history.back(); }}>← Volver</button>

{#if phase !== 'camera'}
	<div class="hero" in:fly={{ y: 15, duration: 300 }}>
		<div class="ico">📷</div>
		<h1>Escanear figurita <span class="ai-badge">🤖 AI</span></h1>
		<p>Apuntá la cámara al <strong>código</strong> (la pastilla negra del dorso, ej: <code>URU 6</code>). Solo eso adentro del recuadro.</p>
		<span class="build-info" title="Versión deployada">v: {__BUILD_INFO__}</span>
	</div>
{/if}

{#if phase === 'idle'}
	<button class="big-btn" onclick={startCamera} in:scale={{ duration: 250, start: 0.95 }}>
		<span class="b-ico">📸</span>
		<span class="b-label">Abrir cámara</span>
	</button>

	<label class="alt-link">
		<span>o subir foto del rollo</span>
		<input type="file" accept="image/*" onchange={onFileInput} hidden />
	</label>

	<div class="tips" in:fly={{ y: 10, duration: 300, delay: 100 }}>
		<p class="t-title">Cómo funciona:</p>
		<ul>
			<li>🟨 Vas a ver un recuadro amarillo en la pantalla</li>
			<li>📏 Acercá la pastilla del código <strong>adentro del recuadro</strong></li>
			<li>🎯 Tocá el botón blanco para capturar SOLO esa zona</li>
		</ul>
	</div>
{/if}

{#if phase === 'camera'}
	<div class="camera-view" in:fade={{ duration: 200 }}>
		<video bind:this={videoEl} autoplay playsinline muted></video>

		<div class="viewfinder-frame">
			<div bind:this={viewfinderEl} class="viewfinder">
				<div class="corner tl"></div>
				<div class="corner tr"></div>
				<div class="corner bl"></div>
				<div class="corner br"></div>
				<span class="vf-hint">Pon el código adentro</span>
			</div>
		</div>

		{#if cameraError}
			<div class="cam-err">⚠️ {cameraError}</div>
		{/if}

		<div class="camera-controls">
			<button class="circle" onclick={reset} aria-label="Cancelar">✕</button>
			<button class="shutter" onclick={captureFromVideo} aria-label="Capturar">
				<span class="shutter-inner"></span>
			</button>
			<button class="circle" onclick={toggleTorch} class:on={torchOn} aria-label="Linterna">
				{torchOn ? '💡' : '🔦'}
			</button>
		</div>
	</div>
{/if}

{#if phase === 'processing'}
	<div class="processing" in:fade>
		{#if previewUrl}
			<img src={previewUrl} alt="Foto" class="capture-preview" />
		{/if}
		<div class="loader">
			<div class="dot"></div>
			<div class="dot"></div>
			<div class="dot"></div>
		</div>
		<p>🤖 La AI está leyendo el código…</p>
		<small>Suele tardar 1-2 segundos</small>
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
				<h2>🤔 Vi {result.matches.length} candidatos</h2>
				<p class="hint">¿Cuál es?</p>
				<ul class="candidates">
					{#each result.matches as s, i (s.id)}
						<li in:fly|local={{ x: -10, duration: 200, delay: i * 30 }}>
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
		<h2>No pude leer el código</h2>
		<div class="debug-box">
			<div class="debug-label">📡 {result?.source === 'ai' ? 'Gemini' : 'OCR'} respondió:</div>
			<div class="debug-text">{result?.rawText?.trim() || '(VACÍO)'}</div>
			<button class="copy-btn" onclick={() => navigator.clipboard?.writeText(result?.rawText ?? '')}>
				📋 Copiar
			</button>
		</div>

		<div class="manual-entry">
			<p class="hint">Escribilo a mano:</p>
			<div class="manual-row">
				<input
					type="text"
					bind:value={manualCode}
					placeholder="ej: URU 7"
					autocapitalize="characters"
					autocomplete="off"
					onkeydown={(e) => e.key === 'Enter' && submitManual()}
				/>
				<button class="primary small" onclick={submitManual}>OK</button>
			</div>
			{#if manualError}
				<p class="err">{manualError}</p>
			{/if}
		</div>

		<div class="actions">
			<button class="primary" onclick={reset}>📸 Probar otra</button>
			<a class="ghost" href="/figus">Buscar en la lista</a>
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
	.ai-badge {
		display: inline-block;
		font-size: 0.65rem;
		background: linear-gradient(135deg, #06b6d4, #3b82f6);
		color: white;
		padding: 3px 8px;
		border-radius: 10px;
		vertical-align: middle;
		margin-left: 0.4rem;
		font-weight: 700;
	}
	.build-info {
		display: inline-block;
		margin-top: 0.6rem;
		font-size: 0.65rem;
		color: var(--muted);
		background: rgba(255, 255, 255, 0.05);
		padding: 2px 8px;
		border-radius: 6px;
		font-family: ui-monospace, monospace;
		opacity: 0.7;
	}
	code {
		background: rgba(255, 255, 255, 0.08);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.8rem;
		color: var(--gold);
	}

	.big-btn {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 2.2rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border: none;
		border-radius: 20px;
		cursor: pointer;
		font-weight: 900;
		font-size: 1.1rem;
		box-shadow: 0 12px 32px rgba(251, 191, 36, 0.4);
		transition: transform 0.15s;
		font-family: inherit;
	}
	.big-btn:active { transform: scale(0.97); }
	.b-ico { font-size: 3rem; }
	.b-label { letter-spacing: 0.5px; }

	.alt-link {
		display: block;
		text-align: center;
		margin: 0.8rem 0 1.4rem;
		color: var(--muted);
		font-size: 0.88rem;
		text-decoration: underline;
		cursor: pointer;
	}

	.tips {
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

	.camera-view {
		position: fixed;
		inset: 0;
		background: #000;
		z-index: 50;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.camera-view video {
		flex: 1;
		width: 100%;
		object-fit: cover;
		background: #000;
	}
	.viewfinder-frame {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		padding: 1rem;
	}
	.viewfinder {
		position: relative;
		width: min(85%, 380px);
		aspect-ratio: 3 / 1;
		max-width: 90%;
		animation: pulse-yellow 2.4s ease-in-out infinite;
	}
	@keyframes pulse-yellow {
		0%, 100% { filter: drop-shadow(0 0 12px rgba(251, 191, 36, 0.5)); }
		50% { filter: drop-shadow(0 0 24px rgba(251, 191, 36, 0.9)); }
	}
	.corner {
		position: absolute;
		width: 28px;
		height: 28px;
		border-color: var(--gold);
		border-style: solid;
		border-width: 0;
	}
	.corner.tl { top: 0; left: 0; border-top-width: 5px; border-left-width: 5px; border-top-left-radius: 12px; }
	.corner.tr { top: 0; right: 0; border-top-width: 5px; border-right-width: 5px; border-top-right-radius: 12px; }
	.corner.bl { bottom: 0; left: 0; border-bottom-width: 5px; border-left-width: 5px; border-bottom-left-radius: 12px; }
	.corner.br { bottom: 0; right: 0; border-bottom-width: 5px; border-right-width: 5px; border-bottom-right-radius: 12px; }
	.vf-hint {
		position: absolute;
		top: -2rem;
		left: 50%;
		transform: translateX(-50%);
		color: var(--gold);
		font-size: 0.85rem;
		font-weight: 700;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
		white-space: nowrap;
	}

	.cam-err {
		position: absolute;
		top: 1rem;
		left: 1rem;
		right: 1rem;
		padding: 0.6rem 0.9rem;
		background: rgba(239, 68, 68, 0.9);
		color: white;
		border-radius: 10px;
		font-size: 0.85rem;
		text-align: center;
	}

	.camera-controls {
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding: 1.2rem 1rem calc(1.2rem + env(safe-area-inset-bottom));
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}
	.circle {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.1);
		color: white;
		font-size: 1.2rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: inherit;
	}
	.circle.on { background: rgba(251, 191, 36, 0.4); border-color: var(--gold); }
	.shutter {
		width: 76px;
		height: 76px;
		border-radius: 50%;
		background: white;
		border: 4px solid rgba(255, 255, 255, 0.5);
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.1s;
		font-family: inherit;
	}
	.shutter:active { transform: scale(0.92); }
	.shutter-inner {
		display: block;
		width: 60px;
		height: 60px;
		background: white;
		border-radius: 50%;
		box-shadow: inset 0 0 0 2px black;
	}

	.processing {
		text-align: center;
		padding: 1.5rem 0;
	}
	.capture-preview {
		max-width: 100%;
		max-height: 200px;
		border-radius: 12px;
		background: #000;
		margin-bottom: 1rem;
		border: 3px solid var(--gold);
		object-fit: contain;
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
		max-height: 200px;
		border: 2px solid var(--border);
	}
	.thumb img {
		width: 100%;
		max-height: 200px;
		object-fit: contain;
		display: block;
		background: #000;
	}

	.match { text-align: center; }
	.big-check { font-size: 4rem; }
	.big-icon { font-size: 3.5rem; text-align: center; margin: 0.5rem 0; }
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
	.primary.small {
		padding: 0.6rem 1rem;
		font-size: 0.9rem;
	}
	.ghost {
		background: transparent;
		color: var(--muted);
		border: 1px solid var(--border);
	}

	.multi h2 { text-align: center; }
	.multi .hint { color: var(--muted); text-align: center; font-size: 0.88rem; margin: 0.2rem 0 0.7rem; }
	.candidates {
		list-style: none;
		padding: 0;
		margin: 0 0 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 50vh;
		overflow-y: auto;
	}
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
	.candidates button:active { transform: scale(0.98); }
	.candidates .info { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.candidates .arrow { color: var(--muted); font-size: 1.4rem; }

	.no-match-card { text-align: center; }
	.no-match-card h2 { text-align: center; }
	.no-match-card .hint { color: var(--muted); margin: 0.5rem 0 0.3rem; font-size: 0.85rem; }

	.debug-box {
		background: rgba(251, 191, 36, 0.12);
		border: 2px solid var(--gold);
		border-radius: 12px;
		padding: 0.9rem;
		margin: 1rem 0;
		text-align: left;
	}
	.debug-label {
		font-size: 0.8rem;
		color: var(--gold);
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-bottom: 0.4rem;
	}
	.debug-text {
		background: var(--card-solid);
		padding: 0.7rem;
		border-radius: 8px;
		color: var(--text);
		font-family: ui-monospace, monospace;
		font-size: 1rem;
		word-break: break-word;
		min-height: 1.5rem;
		border: 1px solid var(--border);
	}
	.copy-btn {
		background: transparent;
		border: 1px solid var(--gold);
		color: var(--gold);
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		font-size: 0.85rem;
		margin-top: 0.5rem;
		cursor: pointer;
		font-family: inherit;
	}

	.manual-entry {
		background: var(--card-solid);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0.8rem;
		margin: 0.8rem 0;
		text-align: left;
	}
	.manual-entry .hint { margin: 0 0 0.4rem; font-weight: 600; text-align: left; }
	.manual-row { display: flex; gap: 0.4rem; }
	.manual-row input {
		flex: 1;
		padding: 0.6rem 0.8rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		text-transform: uppercase;
	}
	.manual-row input:focus {
		outline: none;
		border-color: var(--gold);
	}
	.err { color: var(--bad); font-size: 0.82rem; margin: 0.4rem 0 0; }
</style>
