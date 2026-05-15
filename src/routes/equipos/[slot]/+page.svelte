<script lang="ts">
	import { page } from '$app/state';
	import { db, setStickerLabel, renameTeam, setStatus, setDuplicates } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { fly } from 'svelte/transition';

	const slot = $derived(page.params.slot);

	const data = liveQuery(async () => {
		const codePrefix = `${slot}-`;
		const all = await db.stickers.toArray();
		const stickers = all.filter((s) => s.code.startsWith(codePrefix));
		stickers.sort((a, b) => a.code.localeCompare(b.code));
		const states = await db.states.toArray();
		const stateMap = new Map(states.map((s) => [s.id, s]));
		const teamName = stickers[0]?.team ?? '';
		const group = stickers[0]?.group ?? '';
		const crest = stickers.find((s) => s.role === 'crest');
		const teamPhoto = stickers.find((s) => s.role === 'team-photo');
		const players = stickers.filter((s) => s.role === 'player');
		return { stickers, stateMap, teamName, group, crest, teamPhoto, players };
	});

	let drafts = $state<Record<number, string>>({});
	let teamDraft = $state('');
	let editingTeam = $state(false);
	let saved = $state<number | null>(null);

	$effect(() => {
		if (!$data) return;
		teamDraft = $data.teamName;
		for (const p of $data.players) {
			if (drafts[p.id] === undefined) drafts[p.id] = p.label;
		}
	});

	let saveTimers = new Map<number, ReturnType<typeof setTimeout>>();
	function onPlayerInput(id: number, ev: Event) {
		const value = (ev.target as HTMLInputElement).value;
		drafts[id] = value;
		const existing = saveTimers.get(id);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(async () => {
			await setStickerLabel(id, value.trim() || 'Jugador');
			saved = id;
			setTimeout(() => {
				if (saved === id) saved = null;
			}, 800);
		}, 500);
		saveTimers.set(id, timer);
	}

	async function saveTeamName() {
		if (!$data) return;
		await renameTeam($data.teamName, teamDraft.trim() || $data.teamName);
		editingTeam = false;
	}

	async function toggleStatus(id: number) {
		const st = await db.states.get(id);
		if (!st) return;
		if (st.status === 'missing') await setStatus(id, 'owned');
		else if (st.status === 'owned') await setDuplicates(id, 1);
		else await setStatus(id, 'missing');
	}

	const statusOf = (id: number) => $data?.stateMap.get(id)?.status ?? 'missing';
</script>

<button class="back" onclick={() => history.back()}>← Volver</button>

{#if $data}
	<div class="header" in:fly={{ y: 15, duration: 350 }}>
		<div class="g-badge">Grupo {$data.group}</div>
		{#if editingTeam}
			<div class="team-edit">
				<input bind:value={teamDraft} placeholder="Nombre" autofocus />
				<button class="save" onclick={saveTeamName}>✓</button>
				<button class="cancel" onclick={() => (editingTeam = false)}>✕</button>
			</div>
		{:else}
			<h1 onclick={() => (editingTeam = true)}>
				{$data.teamName}
				<span class="pencil">✎</span>
			</h1>
		{/if}
	</div>

	{#if $data.crest || $data.teamPhoto}
		<section class="team-stickers" in:fly={{ y: 15, duration: 300, delay: 80 }}>
			{#if $data.crest}
				<button class="ts-card" onclick={() => toggleStatus($data.crest!.id)} class:owned={statusOf($data.crest.id) !== 'missing'}>
					<span class="ts-ico">🛡️</span>
					<span class="ts-label">Escudo</span>
					<span class="ts-code">{$data.crest.code}</span>
				</button>
			{/if}
			{#if $data.teamPhoto}
				<button class="ts-card" onclick={() => toggleStatus($data.teamPhoto!.id)} class:owned={statusOf($data.teamPhoto.id) !== 'missing'}>
					<span class="ts-ico">📸</span>
					<span class="ts-label">Plantel</span>
					<span class="ts-code">{$data.teamPhoto.code}</span>
				</button>
			{/if}
		</section>
	{/if}

	<section class="players-section" in:fly={{ y: 15, duration: 300, delay: 160 }}>
		<div class="section-head">
			<h3>Jugadores</h3>
			<span class="hint">Tocá el ⚽ para marcar como tenida · escribí el nombre</span>
		</div>
		<ul class="players">
			{#each $data.players as p, i (p.id)}
				{@const st = statusOf(p.id)}
				<li class="player status-{st}" in:fly|local={{ y: 6, duration: 200, delay: 200 + i * 18 }}>
					<button class="status-btn" onclick={() => toggleStatus(p.id)} aria-label="Estado">
						{#if st === 'owned' || st === 'duplicate'}
							<span class="check">✓</span>
						{:else}
							<span class="ball">⚽</span>
						{/if}
					</button>
					<span class="num">{p.code.split('-')[1]}</span>
					<input
						value={drafts[p.id] ?? p.label}
						oninput={(e) => onPlayerInput(p.id, e)}
						placeholder="Jugador {i + 1}"
						spellcheck="false"
						autocomplete="off"
					/>
					{#if saved === p.id}
						<span class="saved" in:fly={{ x: 6, duration: 150 }}>✓</span>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
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

	.header {
		background: linear-gradient(135deg, rgba(11, 107, 46, 0.4), rgba(10, 26, 46, 0.6));
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1rem;
		margin-bottom: 0.7rem;
	}
	.g-badge {
		display: inline-block;
		background: rgba(251, 191, 36, 0.2);
		color: var(--gold);
		padding: 0.2rem 0.6rem;
		border-radius: 6px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 1px;
		margin-bottom: 0.3rem;
	}
	h1 {
		margin: 0;
		font-size: 1.7rem;
		font-weight: 900;
		letter-spacing: -0.5px;
		cursor: pointer;
	}
	.pencil { color: var(--muted); font-size: 0.85rem; opacity: 0.5; margin-left: 0.4rem; }
	.team-edit { display: flex; gap: 0.4rem; }
	.team-edit input {
		flex: 1;
		padding: 0.5rem;
		background: var(--card-solid);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 1.2rem;
		font-weight: 700;
		font-family: inherit;
	}
	.team-edit .save, .team-edit .cancel {
		border: none;
		color: white;
		border-radius: 8px;
		padding: 0 0.8rem;
		cursor: pointer;
		font-weight: 700;
	}
	.team-edit .save { background: var(--good); }
	.team-edit .cancel { background: rgba(255, 255, 255, 0.1); }

	.team-stickers {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	.ts-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.7rem;
		background: var(--card);
		border: 2px solid var(--border);
		border-radius: 12px;
		cursor: pointer;
		color: var(--text);
		transition: all 0.2s;
		font-family: inherit;
	}
	.ts-card:active { transform: scale(0.97); }
	.ts-card.owned {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.05));
		border-color: var(--good);
	}
	.ts-ico { font-size: 1.5rem; }
	.ts-label { font-weight: 700; font-size: 0.85rem; }
	.ts-code { font-size: 0.65rem; color: var(--muted); letter-spacing: 1px; }

	.players-section {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1rem;
	}
	.section-head { margin-bottom: 0.6rem; }
	h3 {
		margin: 0;
		font-size: 0.85rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-weight: 800;
	}
	.hint { font-size: 0.72rem; color: var(--muted); display: block; margin-top: 0.2rem; }

	.players {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.player {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 10px;
		transition: border-color 0.2s, background 0.2s;
	}
	.player.status-owned, .player.status-duplicate {
		background: rgba(34, 197, 94, 0.06);
		border-color: rgba(34, 197, 94, 0.25);
	}
	.status-btn {
		width: 34px;
		height: 34px;
		min-width: 34px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: var(--text);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		font-family: inherit;
	}
	.status-btn:active { transform: scale(0.85); }
	.player.status-owned .status-btn, .player.status-duplicate .status-btn {
		background: linear-gradient(135deg, #22c55e, #16a34a);
	}
	.check { color: white; font-weight: 900; }
	.ball { font-size: 1rem; }
	.num {
		font-size: 0.65rem;
		color: var(--gold);
		font-weight: 800;
		letter-spacing: 1px;
		min-width: 22px;
	}
	.player input {
		flex: 1;
		padding: 0.45rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--text);
		font-size: 0.95rem;
		font-family: inherit;
		min-width: 0;
	}
	.player input:focus {
		outline: none;
		background: var(--card-solid);
		border-color: var(--gold);
	}
	.saved {
		color: var(--good);
		font-weight: 800;
		font-size: 1.1rem;
		padding-right: 4px;
	}
</style>
