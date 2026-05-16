<script lang="ts">
	import { db, setStatus, setDuplicates } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fly, scale, slide } from 'svelte/transition';

	let query = $state('');
	let statusFilter = $state<'all' | 'owned' | 'missing' | 'duplicate'>('all');
	let groupFilter = $state<string>('all');
	let expandedTeams = $state(new Set<string>());
	let burst = $state<number | null>(null);

	$effect(() => {
		const g = page.url.searchParams.get('group');
		if (g) groupFilter = g;
	});

	type TeamSection = {
		key: string;
		teamName: string;
		group: string;
		stickers: import('$lib/types').Sticker[];
		owned: number;
		missing: number;
		duplicates: number;
		total: number;
		percent: number;
	};

	const data = liveQuery(async () => {
		const [stickers, states] = await Promise.all([
			db.stickers.toArray(),
			db.states.toArray()
		]);
		const stateMap = new Map(states.map((s) => [s.id, s]));

		const sectionsMap = new Map<string, TeamSection>();
		for (const s of stickers) {
			const key = s.role === 'intro' ? '__intro__' : s.team;
			let sec = sectionsMap.get(key);
			if (!sec) {
				sec = {
					key,
					teamName: s.role === 'intro' ? 'Intro / Especiales' : s.team,
					group: s.group,
					stickers: [],
					owned: 0,
					missing: 0,
					duplicates: 0,
					total: 0,
					percent: 0
				};
				sectionsMap.set(key, sec);
			}
			sec.stickers.push(s);
			sec.total++;
			const st = stateMap.get(s.id);
			if (!st || st.status === 'missing') sec.missing++;
			else if (st.status === 'owned') sec.owned++;
			else if (st.status === 'duplicate') {
				sec.owned++;
				sec.duplicates += st.duplicates ?? 0;
			}
		}
		for (const sec of sectionsMap.values()) {
			sec.percent = Math.round((sec.owned / sec.total) * 100);
			sec.stickers.sort((a, b) => a.code.localeCompare(b.code));
		}

		const sections = [...sectionsMap.values()];
		const groups = [...new Set(stickers.filter((s) => s.role !== 'intro').map((s) => s.group))].sort();
		return { sections, stateMap, groups };
	});

	const filteredSections = $derived.by(() => {
		if (!$data) return [];
		const q = query.trim().toLowerCase();
		return $data.sections.filter((sec) => {
			if (groupFilter !== 'all' && sec.key !== '__intro__' && sec.group !== groupFilter) return false;
			if (q) {
				const hay = `${sec.teamName} ${sec.stickers.map((s) => `${s.code} ${s.label}`).join(' ')}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	});

	$effect(() => {
		if (query.trim().length >= 2 && $data) {
			for (const sec of filteredSections) {
				expandedTeams.add(sec.key);
			}
			expandedTeams = new Set(expandedTeams);
		}
	});

	function toggle(key: string) {
		if (expandedTeams.has(key)) expandedTeams.delete(key);
		else expandedTeams.add(key);
		expandedTeams = new Set(expandedTeams);
	}

	function expandAll() {
		expandedTeams = new Set(filteredSections.map((s) => s.key));
	}

	function collapseAll() {
		expandedTeams = new Set();
	}

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
		}, 600);
	}

	async function addDup(id: number, ev: Event) {
		ev.stopPropagation();
		const st = await db.states.get(id);
		await setDuplicates(id, (st?.duplicates ?? 0) + 1);
	}

	function getStatusOf(id: number) {
		const st = $data?.stateMap.get(id);
		return {
			status: st?.status ?? 'missing',
			dups: st?.duplicates ?? 0
		};
	}

	function shouldShowSticker(sticker: import('$lib/types').Sticker): boolean {
		const st = $data?.stateMap.get(sticker.id);
		if (statusFilter === 'owned' && st?.status !== 'owned' && st?.status !== 'duplicate') return false;
		if (statusFilter === 'missing' && st?.status !== 'missing') return false;
		if (statusFilter === 'duplicate' && (st?.duplicates ?? 0) === 0) return false;
		if (query.trim()) {
			const q = query.trim().toLowerCase();
			const hay = `${sticker.code} ${sticker.label} ${sticker.team}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	}
</script>

<a class="scan-fab" href="/figus/escanear" in:scale={{ duration: 300, delay: 100, start: 0.7 }}>
	<span class="fab-ico">📷</span>
	<span>Escanear figu</span>
</a>

<div class="filters" in:fly={{ y: -10, duration: 300 }}>
	<div class="search">
		<span class="search-icon">🔍</span>
		<input type="search" placeholder="Buscar equipo, figu, jugador..." bind:value={query} />
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
		<div class="row-2">
			<select bind:value={groupFilter}>
				<option value="all">🌍 Todos los grupos</option>
				{#each $data.groups as g}
					<option value={g}>Grupo {g}</option>
				{/each}
			</select>
			<div class="expand-controls">
				<button onclick={expandAll} title="Expandir todo">⊞</button>
				<button onclick={collapseAll} title="Cerrar todo">⊟</button>
			</div>
		</div>
	{/if}
</div>

<p class="count">
	<strong>{filteredSections.length}</strong> selección{filteredSections.length === 1 ? '' : 'es'}
</p>

<ul class="sections">
	{#each filteredSections as sec, i (sec.key)}
		{@const isOpen = expandedTeams.has(sec.key)}
		{@const isComplete = sec.percent === 100}
		<li class="section" class:complete={isComplete} in:fly|local={{ y: 8, duration: 200, delay: Math.min(i, 10) * 30 }}>
			<button class="team-head" onclick={() => toggle(sec.key)}>
				<div class="head-main">
					<span class="t-name">{sec.teamName}</span>
					<div class="t-meta">
						<span class="t-grupo">{sec.key === '__intro__' ? '—' : `Grupo ${sec.group}`}</span>
						<span class="t-progress">{sec.owned}/{sec.total}</span>
						{#if isComplete}<span class="trophy">🏆</span>{/if}
					</div>
				</div>
				<div class="head-side">
					<div class="bar"><div class="fill" style="width: {sec.percent}%"></div></div>
					<span class="chev" class:open={isOpen}>▾</span>
				</div>
			</button>

			{#if isOpen}
				<div class="grid-wrap" transition:slide={{ duration: 200 }}>
					<div class="grid">
						{#each sec.stickers as s (s.id)}
							{@const { status, dups } = getStatusOf(s.id)}
							{@const visible = shouldShowSticker(s)}
							{#if visible}
								<div class="cell-wrap">
									<button
										class="cell status-{status}"
										class:burst={burst === s.id}
										onclick={(e) => cycleStatus(s.id, e)}
										ondblclick={() => goto(`/figus/${s.id}`)}
										title={`${s.code} · ${s.label}`}
									>
										<span class="cell-num">{s.code.split('-')[1] ?? s.code.slice(-3)}</span>
										{#if status === 'owned'}<span class="badge-check">✓</span>{/if}
										{#if status === 'duplicate'}<span class="badge-dup">×{dups || 1}</span>{/if}
										{#if burst === s.id}
											<span class="burst-emoji">⚽</span>
										{/if}
									</button>
									{#if status === 'duplicate'}
										<button class="plus-dup" onclick={(e) => addDup(s.id, e)} aria-label="Sumar repe">+</button>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
					<div class="legend">
						<span class="lg miss">⏳ Falta</span>
						<span class="lg own">✅ Tengo</span>
						<span class="lg dup">🔁 Repe</span>
						<span class="lg hint">· Tocá para cambiar · Doble-tap para detalles</span>
					</div>
				</div>
			{/if}
		</li>
	{:else}
		<li class="empty">
			<div class="empty-icon">🔍</div>
			<p>No hay selecciones con esos filtros</p>
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
		margin-bottom: 0.6rem;
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
	}
	input[type='search']:focus {
		outline: none;
		border-color: var(--gold);
		box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
	}

	.row-2 {
		display: flex;
		gap: 0.4rem;
	}
	select {
		flex: 1;
		padding: 0.6rem 0.8rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--text);
		font-size: 0.9rem;
		font-family: inherit;
	}
	.expand-controls {
		display: flex;
		gap: 0.3rem;
	}
	.expand-controls button {
		width: 40px;
		height: 40px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--muted);
		border-radius: 10px;
		font-size: 1.1rem;
		cursor: pointer;
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
	}
	.chips button.active {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-color: transparent;
	}

	.count {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0.5rem 0;
	}
	.count strong { color: var(--gold); }

	.sections {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.section {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
	}
	.section.complete {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(251, 191, 36, 0.08));
		border-color: rgba(251, 191, 36, 0.4);
	}

	.team-head {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.85rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		color: var(--text);
	}
	.team-head:active { background: rgba(255, 255, 255, 0.03); }
	.head-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.t-name {
		font-size: 1rem;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.t-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.t-grupo {
		background: rgba(255, 255, 255, 0.06);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.t-progress { color: var(--gold); font-weight: 700; }
	.trophy { animation: pop 0.4s; }
	@keyframes pop {
		0% { transform: scale(0); }
		100% { transform: scale(1); }
	}
	.head-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		flex-shrink: 0;
	}
	.bar {
		width: 70px;
		height: 5px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #fbbf24);
		transition: width 0.4s;
	}
	.chev {
		color: var(--muted);
		font-size: 0.9rem;
		transition: transform 0.2s;
	}
	.chev.open { transform: rotate(180deg); color: var(--gold); }

	.grid-wrap {
		padding: 0 0.9rem 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 6px;
	}
	@media (min-width: 480px) {
		.grid { grid-template-columns: repeat(7, 1fr); }
	}
	@media (min-width: 600px) {
		.grid { grid-template-columns: repeat(9, 1fr); }
	}

	.cell-wrap {
		position: relative;
	}
	.cell {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--border);
		background: rgba(255, 255, 255, 0.03);
		color: var(--muted);
		border-radius: 8px;
		font-weight: 800;
		font-size: 0.85rem;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
	}
	.cell:active { transform: scale(0.92); }
	.cell-num { font-size: 0.85rem; letter-spacing: -0.5px; }

	.cell.status-missing {
		opacity: 0.55;
	}
	.cell.status-owned {
		background: linear-gradient(135deg, #22c55e, #16a34a);
		border-color: #16a34a;
		color: white;
		box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
	}
	.cell.status-duplicate {
		background: linear-gradient(135deg, #06b6d4, #3b82f6);
		border-color: #06b6d4;
		color: white;
		box-shadow: 0 2px 8px rgba(6, 182, 212, 0.35);
	}
	.cell.burst {
		animation: cell-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes cell-pop {
		0% { transform: scale(1); }
		50% { transform: scale(1.25); box-shadow: 0 0 20px rgba(34, 197, 94, 0.6); }
		100% { transform: scale(1); }
	}
	.badge-check {
		position: absolute;
		top: -4px;
		right: -4px;
		background: var(--gold);
		color: #1a1a1a;
		font-size: 0.55rem;
		padding: 2px 4px;
		border-radius: 50%;
		font-weight: 900;
		min-width: 14px;
		text-align: center;
		display: none;
	}
	.badge-dup {
		position: absolute;
		top: -5px;
		right: -5px;
		background: var(--gold);
		color: #1a1a1a;
		font-size: 0.6rem;
		padding: 1px 5px;
		border-radius: 8px;
		font-weight: 900;
		line-height: 1.2;
	}
	.plus-dup {
		position: absolute;
		bottom: -6px;
		right: -6px;
		width: 20px;
		height: 20px;
		background: var(--accent);
		color: white;
		border: 2px solid var(--bg);
		border-radius: 50%;
		font-size: 0.8rem;
		font-weight: 900;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		font-family: inherit;
	}
	.burst-emoji {
		position: absolute;
		font-size: 1.4rem;
		animation: burst-emoji 0.6s ease-out forwards;
		pointer-events: none;
	}
	@keyframes burst-emoji {
		0% { opacity: 1; transform: scale(0.4) translateY(0); }
		100% { opacity: 0; transform: scale(1.6) translateY(-30px); }
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 0.8rem;
		font-size: 0.72rem;
		color: var(--muted);
	}
	.legend .lg { display: inline-flex; align-items: center; gap: 3px; }
	.legend .hint { opacity: 0.6; }

	.empty {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--muted);
		background: none;
		border: 2px dashed var(--border);
		border-radius: 14px;
	}
	.empty-icon {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		opacity: 0.5;
	}
</style>
