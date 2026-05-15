<script lang="ts">
	import { page } from '$app/state';
	import { db, setStatus, setDuplicates, setPhoto, setNotes, renameTeam } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { fly, scale, fade } from 'svelte/transition';

	const id = $derived(Number(page.params.id));

	const data = liveQuery(async () => {
		const sticker = await db.stickers.get(id);
		const state = await db.states.get(id);
		const trades = await db.trades.where('stickerId').equals(id).toArray();
		return { sticker, state, trades };
	});

	let photoUrl = $state<string | undefined>();
	let notesDraft = $state('');
	let teamDraft = $state('');
	let editingTeam = $state(false);
	let celebrate = $state(false);

	$effect(() => {
		if ($data?.state?.photoBlob) {
			const url = URL.createObjectURL($data.state.photoBlob);
			photoUrl = url;
			return () => URL.revokeObjectURL(url);
		} else {
			photoUrl = undefined;
		}
	});

	$effect(() => {
		if ($data?.state?.notes !== undefined) notesDraft = $data.state.notes ?? '';
	});

	$effect(() => {
		if ($data?.sticker) teamDraft = $data.sticker.team;
	});

	async function onPhoto(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		await setPhoto(id, file);
	}

	async function removePhoto() {
		if (!confirm('¿Borrar la foto?')) return;
		await setPhoto(id, undefined);
	}

	let notesTimer: ReturnType<typeof setTimeout> | undefined;
	function onNotesInput(e: Event) {
		notesDraft = (e.target as HTMLTextAreaElement).value;
		clearTimeout(notesTimer);
		notesTimer = setTimeout(() => setNotes(id, notesDraft), 400);
	}

	async function saveTeamName() {
		if (!$data?.sticker) return;
		await renameTeam($data.sticker.team, teamDraft.trim() || $data.sticker.team);
		editingTeam = false;
	}

	async function setStatusWithCelebration(s: 'missing' | 'owned' | 'duplicate') {
		const prev = $data?.state?.status;
		if (s === 'owned' && prev === 'missing') {
			celebrate = true;
			setTimeout(() => (celebrate = false), 1500);
		}
		if (s === 'duplicate') {
			await setDuplicates(id, Math.max(1, $data?.state?.duplicates ?? 1));
		} else {
			await setStatus(id, s);
		}
	}

	async function logTrade(kind: 'in' | 'out') {
		const withWhom = prompt(kind === 'in' ? '¿De quién la conseguiste?' : '¿A quién se la diste?');
		if (!withWhom) return;
		await db.trades.add({ stickerId: id, kind, withWhom, date: Date.now() });
		if (kind === 'in') {
			const st = await db.states.get(id);
			if (st?.status === 'missing') await setStatus(id, 'owned');
		}
	}

	const roleLabel = (r: string) => ({
		'intro': '🎬 Intro',
		'crest': '🛡️ Escudo',
		'team-photo': '📸 Plantel',
		'player': '⚽ Jugador',
		'special': '⭐ Especial'
	}[r] ?? r);
</script>

{#if celebrate}
	<div class="celebration" aria-hidden="true">
		{#each Array(20) as _, i}
			<span style="--i: {i}; --hue: {(i * 37) % 360}">⚽</span>
		{/each}
		<div class="celebration-msg" in:scale={{ start: 0.3, duration: 400 }}>
			¡GOL! 🎉
		</div>
	</div>
{/if}

<button class="back" onclick={() => history.back()}>← Volver</button>

{#if $data?.sticker}
	{@const s = $data.sticker}
	{@const st = $data.state}

	<div class="hero-card" in:fly={{ y: 20, duration: 350 }}>
		<div class="hero-bg" aria-hidden="true"></div>
		<div class="hero-top">
			<span class="code">{s.code}</span>
			<span class="role">{roleLabel(s.role)}</span>
		</div>

		{#if editingTeam}
			<div class="team-edit">
				<input bind:value={teamDraft} placeholder="Nombre del equipo" autofocus />
				<button class="save" onclick={saveTeamName} aria-label="Guardar">✓</button>
				<button class="cancel" onclick={() => (editingTeam = false)} aria-label="Cancelar">✕</button>
			</div>
		{:else}
			<h2 onclick={() => (editingTeam = true)}>
				{s.team}
				<span class="pencil">✎</span>
			</h2>
		{/if}

		<div class="hero-meta">
			<span class="g-chip">Grupo {s.group}</span>
			<span class="dot">·</span>
			<span>{s.label}</span>
		</div>
	</div>

	<div class="status-card" in:fly={{ y: 20, duration: 350, delay: 80 }}>
		<h3>Estado</h3>
		<div class="status-buttons">
			<button
				class="missing"
				class:active={st?.status === 'missing'}
				onclick={() => setStatusWithCelebration('missing')}
			>
				<span class="ico">⏳</span>
				<span>Falta</span>
			</button>
			<button
				class="owned"
				class:active={st?.status === 'owned'}
				onclick={() => setStatusWithCelebration('owned')}
			>
				<span class="ico">✅</span>
				<span>La tengo</span>
			</button>
			<button
				class="dup"
				class:active={st?.status === 'duplicate'}
				onclick={() => setStatusWithCelebration('duplicate')}
			>
				<span class="ico">🔁</span>
				<span>Repe</span>
			</button>
		</div>
		{#if st?.status === 'duplicate'}
			<div class="dup-row" in:fly={{ y: -8, duration: 200 }}>
				<span>Cuántas repes:</span>
				<button onclick={() => setDuplicates(id, Math.max(0, (st?.duplicates ?? 1) - 1))}>−</button>
				<strong>{st?.duplicates ?? 0}</strong>
				<button onclick={() => setDuplicates(id, (st?.duplicates ?? 0) + 1)}>+</button>
			</div>
		{/if}
	</div>

	<div class="photo-card" in:fly={{ y: 20, duration: 350, delay: 160 }}>
		<h3>📸 Mi foto</h3>
		{#if photoUrl}
			<div class="photo-frame" in:scale={{ duration: 300, start: 0.95 }}>
				<img src={photoUrl} alt="Figurita" />
			</div>
			<button class="danger" onclick={removePhoto}>🗑 Borrar foto</button>
		{:else}
			<label class="photo-btn">
				<span class="camera">📷</span>
				<span>Sacar foto</span>
				<input type="file" accept="image/*" capture="environment" onchange={onPhoto} hidden />
			</label>
		{/if}
	</div>

	<div class="notes-card" in:fly={{ y: 20, duration: 350, delay: 240 }}>
		<h3>📝 Notas</h3>
		<textarea
			placeholder="Ej: me la regaló el abuelo, me la dio Tomi en el recreo..."
			value={notesDraft}
			oninput={onNotesInput}
		></textarea>
	</div>

	<div class="trades-card" in:fly={{ y: 20, duration: 350, delay: 320 }}>
		<h3>🔄 Canjes</h3>
		<div class="trade-buttons">
			<button class="trade-in" onclick={() => logTrade('in')}>
				<span>↓</span> Recibí
			</button>
			<button class="trade-out" onclick={() => logTrade('out')}>
				<span>↑</span> Entregué
			</button>
		</div>
		{#if $data.trades.length > 0}
			<ul class="trades">
				{#each $data.trades.sort((a, b) => b.date - a.date) as t (t.id)}
					<li in:fly|local={{ x: -10, duration: 250 }}>
						<span class="kind {t.kind}">{t.kind === 'in' ? '↓' : '↑'}</span>
						<span>{t.kind === 'in' ? 'De' : 'A'} <strong>{t.withWhom}</strong></span>
						<span class="date">{new Date(t.date).toLocaleDateString('es-AR')}</span>
					</li>
				{/each}
			</ul>
		{/if}
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
		margin-bottom: 0.5rem;
		font-weight: 600;
	}
	.back:active { transform: translateX(-3px); }

	.hero-card {
		position: relative;
		background: linear-gradient(135deg, rgba(11, 107, 46, 0.4), rgba(10, 26, 46, 0.6));
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: 1.2rem;
		margin-bottom: 0.8rem;
		overflow: hidden;
	}
	.hero-bg {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(circle at 80% 0%, rgba(251, 191, 36, 0.25), transparent 50%),
			radial-gradient(circle at 0% 100%, rgba(34, 197, 94, 0.2), transparent 50%);
		pointer-events: none;
	}
	.hero-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.6rem;
		position: relative;
	}
	.code {
		font-size: 0.75rem;
		color: var(--gold);
		letter-spacing: 2px;
		font-weight: 800;
	}
	.role {
		font-size: 0.7rem;
		background: rgba(255, 255, 255, 0.1);
		padding: 0.2rem 0.6rem;
		border-radius: 8px;
		font-weight: 600;
	}
	h2 {
		margin: 0.3rem 0 0.2rem;
		font-size: 1.8rem;
		cursor: pointer;
		font-weight: 900;
		position: relative;
		letter-spacing: -0.5px;
		line-height: 1.1;
	}
	.pencil {
		color: var(--muted);
		font-size: 0.9rem;
		opacity: 0.5;
		margin-left: 0.4rem;
	}
	.team-edit {
		display: flex;
		gap: 0.4rem;
		margin: 0.4rem 0;
		position: relative;
	}
	.team-edit input {
		flex: 1;
		padding: 0.6rem;
		background: var(--card-solid);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 1.1rem;
		font-weight: 700;
		font-family: inherit;
	}
	.team-edit .save, .team-edit .cancel {
		border: none;
		color: var(--text);
		border-radius: 8px;
		padding: 0 0.9rem;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 700;
	}
	.team-edit .save { background: var(--good); }
	.team-edit .cancel { background: rgba(255, 255, 255, 0.1); }
	.hero-meta {
		color: var(--muted);
		font-size: 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		position: relative;
	}
	.g-chip {
		background: rgba(251, 191, 36, 0.15);
		color: var(--gold);
		padding: 0.2rem 0.6rem;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.dot { opacity: 0.5; }

	.status-card, .photo-card, .notes-card, .trades-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1rem;
		margin-bottom: 0.7rem;
	}
	h3 {
		margin: 0 0 0.7rem;
		font-size: 0.85rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-weight: 800;
	}

	.status-buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}
	.status-buttons button {
		padding: 0.7rem 0.3rem;
		background: rgba(255, 255, 255, 0.04);
		border: 2px solid transparent;
		color: var(--text);
		border-radius: 12px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		transition: all 0.2s;
		font-weight: 700;
		font-size: 0.85rem;
	}
	.status-buttons button .ico { font-size: 1.5rem; }
	.status-buttons button:active { transform: scale(0.96); }
	.status-buttons .missing.active {
		background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(245, 158, 11, 0.1));
		border-color: var(--warn);
		box-shadow: 0 4px 16px rgba(245, 158, 11, 0.25);
	}
	.status-buttons .owned.active {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.1));
		border-color: var(--good);
		box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
	}
	.status-buttons .dup.active {
		background: linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(6, 182, 212, 0.1));
		border-color: var(--accent-2);
		box-shadow: 0 4px 16px rgba(6, 182, 212, 0.25);
	}
	.dup-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-top: 0.8rem;
		justify-content: center;
		background: rgba(6, 182, 212, 0.1);
		padding: 0.6rem;
		border-radius: 10px;
	}
	.dup-row button {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: none;
		background: var(--accent-2);
		color: white;
		font-size: 1.2rem;
		cursor: pointer;
		font-weight: 800;
	}
	.dup-row strong {
		font-size: 1.4rem;
		color: var(--accent-2);
	}

	.photo-frame {
		border-radius: 12px;
		overflow: hidden;
		background: #000;
		margin-bottom: 0.6rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		border: 3px solid var(--gold);
	}
	.photo-frame img {
		width: 100%;
		max-height: 380px;
		object-fit: contain;
		display: block;
	}
	.photo-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 1.4rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-radius: 14px;
		cursor: pointer;
		font-weight: 800;
		font-size: 1rem;
		box-shadow: 0 6px 20px rgba(251, 191, 36, 0.35);
		transition: transform 0.15s;
	}
	.photo-btn:active { transform: scale(0.97); }
	.camera { font-size: 1.6rem; }
	.danger {
		background: transparent;
		border: 1px solid var(--bad);
		color: var(--bad);
		padding: 0.55rem 1rem;
		border-radius: 10px;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}

	textarea {
		width: 100%;
		min-height: 90px;
		padding: 0.7rem;
		background: var(--card-solid);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-family: inherit;
		font-size: 0.95rem;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--gold);
	}

	.trade-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}
	.trade-buttons button {
		padding: 0.7rem;
		border: none;
		color: white;
		border-radius: 10px;
		cursor: pointer;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.95rem;
	}
	.trade-buttons button:active { transform: scale(0.97); }
	.trade-in { background: linear-gradient(135deg, #22c55e, #16a34a); }
	.trade-out { background: linear-gradient(135deg, #f59e0b, #d97706); }
	.trades {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.trades li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	.trades li:last-child { border-bottom: none; }
	.kind {
		width: 26px; height: 26px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 0.85rem;
		font-weight: 800;
		color: white;
	}
	.kind.in { background: var(--good); }
	.kind.out { background: var(--warn); }
	.date { margin-left: auto; color: var(--muted); font-size: 0.78rem; }

	.celebration {
		position: fixed;
		inset: 0;
		z-index: 100;
		pointer-events: none;
		overflow: hidden;
	}
	.celebration span {
		position: absolute;
		left: 50%;
		top: 50%;
		font-size: 1.8rem;
		animation: ball-fly 1.4s ease-out forwards;
		--angle: calc(var(--i) * 18deg);
		filter: drop-shadow(0 0 8px hsl(var(--hue), 80%, 60%));
	}
	@keyframes ball-fly {
		0% {
			opacity: 1;
			transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0) scale(0.3);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) rotate(var(--angle)) translateX(60vw) scale(1.4) rotate(720deg);
		}
	}
	.celebration-msg {
		position: absolute;
		left: 50%;
		top: 40%;
		transform: translate(-50%, -50%);
		font-size: 3.5rem;
		font-weight: 900;
		background: linear-gradient(135deg, #fbbf24, #22c55e);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 0 40px rgba(251, 191, 36, 0.6);
		animation: msg-bounce 1.4s ease-out forwards;
		letter-spacing: -2px;
	}
	@keyframes msg-bounce {
		0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
		15% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
		30% { transform: translate(-50%, -50%) scale(1); }
		80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
		100% { opacity: 0; transform: translate(-50%, -60%) scale(0.9); }
	}
</style>
