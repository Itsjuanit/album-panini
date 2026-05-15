<script lang="ts">
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { fly, scale } from 'svelte/transition';

	const data = liveQuery(async () => {
		const [stickers, states] = await Promise.all([db.stickers.toArray(), db.states.toArray()]);
		const stateMap = new Map(states.map((s) => [s.id, s]));
		const byTeam = new Map<
			string,
			{ team: string; group: string; slot: string; total: number; owned: number; namedPlayers: number; totalPlayers: number }
		>();
		for (const s of stickers) {
			if (s.role === 'intro') continue;
			const slot = s.code.split('-')[0];
			const entry = byTeam.get(s.team) ?? {
				team: s.team,
				group: s.group,
				slot,
				total: 0,
				owned: 0,
				namedPlayers: 0,
				totalPlayers: 0
			};
			entry.total++;
			const st = stateMap.get(s.id);
			if (st && (st.status === 'owned' || st.status === 'duplicate')) entry.owned++;
			if (s.role === 'player') {
				entry.totalPlayers++;
				if (!/^Jugador \d+$/.test(s.label)) entry.namedPlayers++;
			}
			byTeam.set(s.team, entry);
		}
		const byGroup = new Map<string, typeof byTeam extends Map<string, infer V> ? V[] : never>();
		for (const t of byTeam.values()) {
			const arr = byGroup.get(t.group) ?? [];
			arr.push(t);
			byGroup.set(t.group, arr);
		}
		return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
	});
</script>

<h1>Equipos</h1>
<p class="subtitle">Tocá un equipo para editar sus 18 jugadores</p>

{#if $data}
	{#each $data as [group, teams], gi (group)}
		<section in:fly={{ y: 12, duration: 300, delay: gi * 40 }}>
			<h2><span class="g-letter">{group}</span> Grupo {group}</h2>
			<div class="grid">
				{#each teams as t, i (t.slot)}
					{@const pct = Math.round((t.owned / t.total) * 100)}
					{@const namedPct = Math.round((t.namedPlayers / t.totalPlayers) * 100)}
					<a class="team-card" href={`/equipos/${t.slot}`} in:scale={{ duration: 200, delay: gi * 40 + i * 25, start: 0.92 }}>
						<div class="team-head">
							<span class="team-name">{t.team}</span>
							{#if namedPct === 100}
								<span class="badge-done" title="Plantel completo">📝</span>
							{:else if namedPct > 0}
								<span class="badge-partial">{namedPct}%</span>
							{/if}
						</div>
						<div class="bar"><div class="fill" style="width: {pct}%"></div></div>
						<div class="meta">
							<span>{t.owned}/{t.total} figus</span>
							<span class="players">{t.namedPlayers}/{t.totalPlayers} jugadores</span>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/each}
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin: 0;
		font-weight: 900;
		letter-spacing: -0.5px;
	}
	.subtitle {
		color: var(--muted);
		font-size: 0.88rem;
		margin: 0.2rem 0 1rem;
	}
	section { margin-bottom: 1.3rem; }
	h2 {
		font-size: 0.95rem;
		margin: 0 0 0.6rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-weight: 800;
	}
	.g-letter {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #1a1a1a;
		border-radius: 50%;
		font-weight: 900;
		font-size: 0.8rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}
	.team-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0.7rem;
		text-decoration: none;
		color: var(--text);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		transition: transform 0.18s, border-color 0.2s;
	}
	.team-card:active { transform: scale(0.97); }
	.team-card:hover { border-color: var(--gold); }
	.team-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.4rem;
	}
	.team-name {
		font-weight: 700;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.badge-done { font-size: 1rem; }
	.badge-partial {
		background: rgba(251, 191, 36, 0.2);
		color: var(--gold);
		padding: 1px 6px;
		border-radius: 6px;
		font-size: 0.7rem;
		font-weight: 700;
	}
	.bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #fbbf24);
		transition: width 0.5s;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--muted);
	}
	.players { color: var(--accent-2); }
</style>
