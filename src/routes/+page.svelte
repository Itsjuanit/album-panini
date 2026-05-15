<script lang="ts">
	import { db } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { TOTAL_STICKERS } from '$lib/seed';
	import { fly, scale } from 'svelte/transition';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	const summary = liveQuery(async () => {
		const states = await db.states.toArray();
		const owned = states.filter((s) => s.status === 'owned' || s.status === 'duplicate').length;
		const missing = states.filter((s) => s.status === 'missing').length;
		const dups = states.reduce((acc, s) => acc + (s.duplicates ?? 0), 0);
		const stickers = await db.stickers.toArray();
		const byGroup = new Map<string, { total: number; owned: number; teams: Set<string> }>();
		for (const s of stickers) {
			if (s.role === 'intro') continue;
			const g = byGroup.get(s.group) ?? { total: 0, owned: 0, teams: new Set() };
			g.total++;
			g.teams.add(s.team);
			const st = states.find((x) => x.id === s.id);
			if (st && (st.status === 'owned' || st.status === 'duplicate')) g.owned++;
			byGroup.set(s.group, g);
		}
		return {
			owned,
			missing,
			dups,
			byGroup: [...byGroup.entries()].map(([g, v]) => ({
				group: g,
				total: v.total,
				owned: v.owned,
				teams: [...v.teams]
			}))
		};
	});

	const animPct = tweened(0, { duration: 1200, easing: cubicOut });
	const animOwned = tweened(0, { duration: 900, easing: cubicOut });
	const animMissing = tweened(0, { duration: 900, easing: cubicOut });
	const animDups = tweened(0, { duration: 900, easing: cubicOut });

	$effect(() => {
		if ($summary) {
			animPct.set(Math.round(($summary.owned / TOTAL_STICKERS) * 100));
			animOwned.set($summary.owned);
			animMissing.set($summary.missing);
			animDups.set($summary.dups);
		}
	});

	const pct = $derived(Math.round($animPct));
</script>

<section class="hero" in:fly={{ y: 20, duration: 500 }}>
	<div class="ring-wrap">
		<svg viewBox="0 0 140 140" class="ring">
			<defs>
				<linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
					<stop offset="0" stop-color="#22c55e" />
					<stop offset="0.5" stop-color="#fbbf24" />
					<stop offset="1" stop-color="#f59e0b" />
				</linearGradient>
				<filter id="glow">
					<feGaussianBlur stdDeviation="3" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<circle cx="70" cy="70" r="58" stroke="rgba(255,255,255,0.08)" stroke-width="10" fill="none" />
			<circle
				cx="70"
				cy="70"
				r="58"
				stroke="url(#g)"
				stroke-width="10"
				fill="none"
				stroke-linecap="round"
				stroke-dasharray={2 * Math.PI * 58}
				stroke-dashoffset={2 * Math.PI * 58 * (1 - pct / 100)}
				transform="rotate(-90 70 70)"
				filter="url(#glow)"
				style="transition: stroke-dashoffset 0.4s"
			/>
		</svg>
		<div class="ring-center">
			<span class="pct-n">{pct}<small>%</small></span>
			<span class="pct-l">completo</span>
		</div>
	</div>

	<div class="badge">
		<span class="badge-emoji">🏆</span>
		<div>
			<div class="badge-n">{Math.round($animOwned)}<span class="of">/{TOTAL_STICKERS}</span></div>
			<div class="badge-l">figuritas pegadas</div>
		</div>
	</div>
</section>

<section class="stats" in:fly={{ y: 20, duration: 500, delay: 100 }}>
	<div class="stat owned">
		<div class="stat-icon">✅</div>
		<div class="stat-body">
			<span class="n">{Math.round($animOwned)}</span>
			<span class="l">la tengo</span>
		</div>
	</div>
	<div class="stat missing">
		<div class="stat-icon">⏳</div>
		<div class="stat-body">
			<span class="n">{Math.round($animMissing)}</span>
			<span class="l">me falta</span>
		</div>
	</div>
	<div class="stat dups">
		<div class="stat-icon">🔁</div>
		<div class="stat-body">
			<span class="n">{Math.round($animDups)}</span>
			<span class="l">repes</span>
		</div>
	</div>
</section>

{#if $summary}
	<section class="groups" in:fly={{ y: 20, duration: 500, delay: 200 }}>
		<h2><span class="trophy">⚽</span> Avance por grupo</h2>
		<div class="grid">
			{#each $summary.byGroup as g, i (g.group)}
				{@const p = Math.round((g.owned / g.total) * 100)}
				{@const complete = p === 100}
				<a
					class="group-card"
					class:complete
					href={`/figus?group=${encodeURIComponent(g.group)}`}
					in:scale={{ duration: 300, delay: 250 + i * 35, start: 0.85 }}
				>
					<div class="group-head">
						<span class="g-letter">{g.group}</span>
						{#if complete}
							<span class="check">★</span>
						{/if}
					</div>
					<div class="teams">
						{#each g.teams.slice(0, 4) as t}
							<span class="team-pill">{t}</span>
						{/each}
					</div>
					<div class="bar"><div class="fill" style="width: {p}%"></div></div>
					<div class="meta">
						<span>{g.owned}/{g.total}</span>
						<span class="p">{p}%</span>
					</div>
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.hero {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0 1.2rem;
	}
	.ring-wrap {
		position: relative;
		flex-shrink: 0;
		width: 160px;
		height: 160px;
	}
	.ring {
		width: 100%;
		height: 100%;
		filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.35));
	}
	.ring-center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}
	.pct-n {
		font-size: 2.6rem;
		font-weight: 900;
		line-height: 1;
		background: linear-gradient(135deg, #fbbf24, #22c55e);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		letter-spacing: -1px;
	}
	.pct-n small {
		font-size: 1.2rem;
		opacity: 0.7;
	}
	.pct-l {
		font-size: 0.7rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 2px;
		margin-top: 4px;
	}

	.badge {
		flex: 1;
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.18), rgba(34, 197, 94, 0.12));
		border: 1px solid rgba(251, 191, 36, 0.3);
		border-radius: 18px;
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
	}
	.badge-emoji { font-size: 2.4rem; filter: drop-shadow(0 4px 8px rgba(251, 191, 36, 0.4)); }
	.badge-n {
		font-size: 1.8rem;
		font-weight: 900;
		line-height: 1;
		color: var(--gold);
	}
	.badge-n .of {
		font-size: 0.9rem;
		color: var(--muted);
		font-weight: 600;
	}
	.badge-l {
		font-size: 0.75rem;
		color: var(--muted);
		margin-top: 4px;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
		margin-bottom: 1.5rem;
	}
	.stat {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		transition: transform 0.2s, box-shadow 0.2s;
		position: relative;
		overflow: hidden;
	}
	.stat::before {
		content: '';
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 3px;
	}
	.stat.owned::before { background: linear-gradient(90deg, #22c55e, #16a34a); }
	.stat.missing::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
	.stat.dups::before { background: linear-gradient(90deg, #06b6d4, #3b82f6); }
	.stat:active { transform: scale(0.97); }
	.stat-icon { font-size: 1.6rem; }
	.stat-body { text-align: center; }
	.stat .n {
		display: block;
		font-size: 1.6rem;
		font-weight: 900;
		line-height: 1;
	}
	.stat .l {
		display: block;
		font-size: 0.7rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-top: 4px;
	}

	h2 {
		font-size: 1.05rem;
		margin: 0 0 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 800;
	}
	.trophy {
		display: inline-block;
		animation: kick 3s ease-in-out infinite;
	}
	@keyframes kick {
		0%, 100% { transform: rotate(0); }
		15% { transform: rotate(-15deg) scale(1.1); }
		30% { transform: rotate(15deg); }
		45% { transform: rotate(0); }
	}

	.groups .grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.7rem;
	}
	@media (min-width: 540px) {
		.groups .grid { grid-template-columns: repeat(3, 1fr); }
	}
	.group-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 0.9rem;
		text-decoration: none;
		color: var(--text);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		transition: transform 0.2s, box-shadow 0.25s, border-color 0.2s;
		position: relative;
		overflow: hidden;
	}
	.group-card:active { transform: scale(0.97); }
	.group-card:hover {
		border-color: var(--gold);
		box-shadow: 0 8px 24px rgba(251, 191, 36, 0.15);
	}
	.group-card.complete {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(251, 191, 36, 0.15));
		border-color: rgba(251, 191, 36, 0.5);
	}
	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.g-letter {
		font-size: 1.4rem;
		font-weight: 900;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.check {
		color: var(--gold);
		font-size: 1.2rem;
		animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes pop {
		0% { transform: scale(0) rotate(-180deg); }
		100% { transform: scale(1) rotate(0); }
	}
	.teams {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		min-height: 32px;
	}
	.team-pill {
		font-size: 0.62rem;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.bar {
		height: 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, #22c55e, #fbbf24);
		transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		font-size: 0.7rem;
		color: var(--muted);
		font-weight: 600;
	}
	.meta .p { color: var(--gold); }
</style>
