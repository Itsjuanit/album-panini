<script lang="ts">
	import { db, setStatus, setDuplicates } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fly, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	let query = $state('');
	let statusFilter = $state<'all' | 'owned' | 'missing' | 'duplicate'>('all');
	let groupFilter = $state<string>('all');
	let burst = $state<number | null>(null);

	$effect(() => {
		const g = page.url.searchParams.get('group');
		if (g) groupFilter = g;
	});

	const data = liveQuery(async () => {
		const [stickers, states, teams] = await Promise.all([
			db.stickers.toArray(),
			db.states.toArray(),
			db.teams.toArray()
		]);
		const stateMap = new Map(states.map((s) => [s.id, s]));
		const groups = [...new Set(stickers.map((s) => s.group))].sort();
		return { stickers, stateMap, groups, teams };
	});

	const filtered = $derived.by(() => {
		if (!$data) return [];
		const q = query.trim().toLowerCase();
		return $data.stickers.filter((s) => {
			if (groupFilter !== 'all' && s.group !== groupFilter) return false;
			const st = $data.stateMap.get(s.id);
			if (statusFilter === 'owned' && st?.status !== 'owned' && st?.status !== 'duplicate') return false;
			if (statusFilter === 'missing' && st?.status !== 'missing') return false;
			if (statusFilter === 'duplicate' && (st?.duplicates ?? 0) === 0) return false;
			if (q) {
				const hay = `${s.code} ${s.team} ${s.label}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	});

	async function cycleStatus(id: number, e: Event) {
		e.stopPropagation();
		const st = await db.states.get(id);
		if (!st) return;
		if (st.status === 'missing') {
			await setStatus(id, 'owned');
			triggerBurst(id);
		} else if (st.status === 'owned') {
			await setDuplicates(id, 1);
		} else {
			await setStatus(id, 'missing');
		}
	}

	function triggerBurst(id: number) {
		burst = id;
		setTimeout(() => {
			if (burst === id) burst = null;
		}, 700);
	}

	async function addDup(id: number, ev: Event) {
		ev.stopPropagation();
		const st = await db.states.get(id);
		await setDuplicates(id, (st?.duplicates ?? 0) + 1);
	}

	async function removeDup(id: number, ev: Event) {
		ev.stopPropagation();
		const st = await db.states.get(id);
		const newCount = Math.max(0, (st?.duplicates ?? 0) - 1);
		if (newCount === 0 && st?.status === 'duplicate') await setStatus(id, 'owned');
		else await setDuplicates(id, newCount);
	}
</script>

<a class="scan-fab" href="/figus/escanear" in:scale={{ duration: 300, delay: 100, start: 0.7 }}>
	<span class="fab-ico">📷</span>
	<span>Escanear figu</span>
</a>

<div class="filters" in:fly={{ y: -10, duration: 300 }}>
	<div class="search">
		<span class="search-icon">🔍</span>
		<input type="search" placeholder="Buscar figurita, equipo..." bind:value={query} />
		{#if query}
			<button class="clear" onclick={() => (query = '')} aria-label="Limpiar">✕</button>
		{/if}
	</div>

	<div class="chips">
		<button class:active={statusFilter === 'all'} onclick={() => (statusFilter = 'all')}>
			Todas
		</button>
		<button class:active={statusFilter === 'owned'} onclick={() => (statusFilter = 'owned')}>
			✅ Tengo
		</button>
		<button class:active={statusFilter === 'missing'} onclick={() => (statusFilter = 'missing')}>
			⏳ Faltan
		</button>
		<button class:active={statusFilter === 'duplicate'} onclick={() => (statusFilter = 'duplicate')}>
			🔁 Repes
		</button>
	</div>

	{#if $data}
		<select bind:value={groupFilter}>
			<option value="all">🌍 Todos los grupos</option>
			{#each $data.groups as g}
				<option value={g}>Grupo {g}</option>
			{/each}
		</select>
	{/if}
</div>

<p class="count">
	<strong>{filtered.length}</strong> figurita{filtered.length === 1 ? '' : 's'}
</p>

<ul class="list">
	{#each filtered as s, i (s.id)}
		{@const st = $data?.stateMap.get(s.id)}
		<li
			class="row status-{st?.status ?? 'missing'}"
			class:burst={burst === s.id}
			onclick={() => goto(`/figus/${s.id}`)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && goto(`/figus/${s.id}`)}
			animate:flip={{ duration: 250 }}
			in:fly|local={{ y: 10, duration: 250, delay: Math.min(i, 12) * 25 }}
		>
			<button class="toggle" onclick={(e) => cycleStatus(s.id, e)} aria-label="Cambiar estado">
				{#if st?.status === 'owned' || st?.status === 'duplicate'}
					<span class="check-mark">✓</span>
				{:else}
					<span class="plus">＋</span>
				{/if}
			</button>
			<div class="info">
				<span class="code">{s.code}</span>
				<span class="label">{s.team}</span>
				<span class="sub">{s.label}</span>
			</div>
			{#if st?.status === 'duplicate' && (st.duplicates ?? 0) > 0}
				<div class="dup-controls" onclick={(e) => e.stopPropagation()} role="group">
					<button onclick={(e) => removeDup(s.id, e)} aria-label="Menos">−</button>
					<span class="dup-n">×{st.duplicates}</span>
					<button onclick={(e) => addDup(s.id, e)} aria-label="Más">+</button>
				</div>
			{:else}
				<span class="chev">›</span>
			{/if}

			{#if burst === s.id}
				<div class="confetti" aria-hidden="true">
					{#each ['⚽', '⭐', '✨', '🎉', '⚡'] as e, idx (idx)}
						<span style="--d: {idx * 60}deg">{e}</span>
					{/each}
				</div>
			{/if}
		</li>
	{:else}
		<li class="empty">
			<div class="empty-icon">🔍</div>
			<p>No hay figuritas con esos filtros</p>
		</li>
	{/each}
</ul>

<style>
	.scan-fab {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.85rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-radius: 14px;
		text-decoration: none;
		font-weight: 800;
		font-size: 0.95rem;
		box-shadow: 0 8px 24px rgba(251, 191, 36, 0.35);
		margin-bottom: 0.8rem;
		transition: transform 0.15s;
	}
	.scan-fab:active { transform: scale(0.97); }
	.fab-ico { font-size: 1.4rem; }

	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
	}
	.search-icon {
		position: absolute;
		left: 0.8rem;
		pointer-events: none;
		opacity: 0.6;
	}
	.clear {
		position: absolute;
		right: 0.6rem;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
		cursor: pointer;
	}
	input[type='search'] {
		width: 100%;
		padding: 0.75rem 2.4rem 0.75rem 2.4rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		font-size: 1rem;
		transition: border-color 0.2s, box-shadow 0.2s;
	}
	input[type='search']:focus {
		outline: none;
		border-color: var(--gold);
		box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
	}
	select {
		width: 100%;
		padding: 0.7rem 0.8rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		font-size: 0.95rem;
		font-family: inherit;
	}

	.chips {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 2px;
	}
	.chips::-webkit-scrollbar { display: none; }
	.chips button {
		flex-shrink: 0;
		padding: 0.5rem 1rem;
		background: var(--card);
		border: 1px solid var(--border);
		color: var(--muted);
		border-radius: 20px;
		font-size: 0.85rem;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
	}
	.chips button.active {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-color: transparent;
		box-shadow: 0 4px 12px rgba(251, 191, 36, 0.35);
	}
	.chips button:active { transform: scale(0.95); }

	.count {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0.5rem 0;
	}
	.count strong { color: var(--gold); }

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.7rem 0.9rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		cursor: pointer;
		transition: transform 0.18s, border-color 0.2s, background 0.2s;
		position: relative;
		overflow: visible;
	}
	.row:active { transform: scale(0.985); }
	.row.status-owned {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.05));
		border-color: rgba(34, 197, 94, 0.35);
	}
	.row.status-duplicate {
		background: linear-gradient(135deg, rgba(6, 182, 212, 0.18), rgba(59, 130, 246, 0.05));
		border-color: rgba(6, 182, 212, 0.35);
	}
	.row.burst {
		animation: row-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes row-pop {
		0% { transform: scale(1); }
		40% { transform: scale(1.04); box-shadow: 0 0 30px var(--good-glow); }
		100% { transform: scale(1); }
	}

	.toggle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
		font-size: 1.3rem;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.row.status-owned .toggle, .row.status-duplicate .toggle {
		background: linear-gradient(135deg, #22c55e, #16a34a);
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
	}
	.toggle:active { transform: scale(0.85); }
	.check-mark, .plus { font-weight: 900; }

	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}
	.code {
		font-size: 0.65rem;
		color: var(--muted);
		letter-spacing: 1px;
		font-weight: 700;
	}
	.label {
		font-size: 0.95rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 0.75rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chev {
		color: var(--muted);
		font-size: 1.5rem;
		font-weight: 300;
	}

	.dup-controls {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		background: rgba(255, 255, 255, 0.06);
		padding: 0.25rem;
		border-radius: 20px;
	}
	.dup-controls button {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--text);
		font-size: 0.9rem;
		cursor: pointer;
		font-weight: 700;
	}
	.dup-n {
		min-width: 2ch;
		text-align: center;
		font-weight: 800;
		color: var(--accent-2);
		font-size: 0.85rem;
	}

	.confetti {
		position: absolute;
		inset: 0;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.confetti span {
		position: absolute;
		left: 22px;
		font-size: 1rem;
		animation: burst 0.65s ease-out forwards;
		transform: rotate(var(--d));
	}
	@keyframes burst {
		0% {
			opacity: 1;
			transform: rotate(var(--d)) translateX(0) scale(0.4);
		}
		100% {
			opacity: 0;
			transform: rotate(var(--d)) translateX(70px) scale(1.2);
		}
	}

	.empty {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted);
		background: none;
		border: 2px dashed var(--border);
	}
	.empty-icon {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		opacity: 0.5;
	}
</style>
