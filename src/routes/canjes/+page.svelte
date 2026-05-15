<script lang="ts">
	import { db, exportAll, importAll } from '$lib/db';
	import { liveQuery } from 'dexie';
	import { fly } from 'svelte/transition';

	const trades = liveQuery(async () => {
		const all = await db.trades.orderBy('date').reverse().toArray();
		const stickers = await db.stickers.toArray();
		const map = new Map(stickers.map((s) => [s.id, s]));
		return all.map((t) => ({ ...t, sticker: map.get(t.stickerId) }));
	});

	const dupes = liveQuery(async () => {
		const states = await db.states.toArray();
		const stickers = await db.stickers.toArray();
		const map = new Map(stickers.map((s) => [s.id, s]));
		return states
			.filter((s) => (s.duplicates ?? 0) > 0)
			.map((s) => ({ ...s, sticker: map.get(s.id) }))
			.sort((a, b) => (b.duplicates ?? 0) - (a.duplicates ?? 0));
	});

	let importing = $state(false);
	let importMsg = $state<string | undefined>();

	async function handleImport(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		if (!confirm('Esto va a REEMPLAZAR todo el progreso actual. ¿Seguro?')) {
			(e.target as HTMLInputElement).value = '';
			return;
		}
		importing = true;
		importMsg = undefined;
		try {
			const text = await file.text();
			await importAll(text);
			importMsg = '✓ Respaldo importado correctamente';
		} catch (err) {
			importMsg = '✕ Error: ' + (err as Error).message;
		} finally {
			importing = false;
			(e.target as HTMLInputElement).value = '';
		}
	}

	async function downloadBackup() {
		const json = await exportAll();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `album-panini-2026-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<section in:fly={{ y: 15, duration: 300 }}>
	<h2><span class="ico">🎯</span> Mis repetidas</h2>
	{#if $dupes}
		{#if $dupes.length === 0}
			<div class="empty">
				<div class="empty-icon">🃏</div>
				<p>Todavía no tenés repetidas marcadas</p>
				<small>Cuando tengas figus dobles, vienen acá</small>
			</div>
		{:else}
			<ul class="dupes">
				{#each $dupes as d, i (d.id)}
					<li in:fly|local={{ y: 8, duration: 200, delay: i * 20 }}>
						<a href={`/figus/${d.id}`}>
							<div class="dupe-info">
								<span class="code">{d.sticker?.code}</span>
								<span class="label">{d.sticker?.team}</span>
								<span class="sub">{d.sticker?.label}</span>
							</div>
							<span class="qty">×{d.duplicates}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<section in:fly={{ y: 15, duration: 300, delay: 100 }}>
	<h2><span class="ico">📜</span> Historial de canjes</h2>
	{#if $trades}
		{#if $trades.length === 0}
			<div class="empty">
				<div class="empty-icon">🤝</div>
				<p>Sin canjes registrados</p>
				<small>Anotá cada canje desde el detalle de la figu</small>
			</div>
		{:else}
			<ul class="trades">
				{#each $trades as t, i (t.id)}
					<li in:fly|local={{ x: -8, duration: 250, delay: i * 15 }}>
						<span class="kind {t.kind}">{t.kind === 'in' ? '↓' : '↑'}</span>
						<a href={`/figus/${t.stickerId}`}>
							<strong>{t.sticker?.code}</strong>
							<span>{t.sticker?.label}</span>
						</a>
						<span class="who">{t.kind === 'in' ? 'de' : 'a'} {t.withWhom}</span>
						<span class="date">{new Date(t.date).toLocaleDateString('es-AR')}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<section in:fly={{ y: 15, duration: 300, delay: 200 }}>
	<h2><span class="ico">💾</span> Respaldo</h2>
	<p class="hint">Guardá tu progreso o pasalo a otro celu</p>
	<div class="backup-buttons">
		<button class="primary" onclick={downloadBackup}>
			<span>⬇</span> Descargar
		</button>
		<label class="secondary" class:disabled={importing}>
			<span>⬆</span> {importing ? 'Importando…' : 'Importar'}
			<input type="file" accept="application/json,.json" onchange={handleImport} hidden disabled={importing} />
		</label>
	</div>
	{#if importMsg}
		<p class="msg" in:fly={{ y: -5, duration: 200 }}>{importMsg}</p>
	{/if}
</section>

<style>
	section {
		margin-bottom: 1.3rem;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 1rem;
	}
	h2 {
		font-size: 0.9rem;
		color: var(--muted);
		margin: 0 0 0.7rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-weight: 800;
	}
	.ico { font-size: 1.2rem; }
	.empty {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--muted);
	}
	.empty-icon {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		opacity: 0.6;
	}
	.empty p { margin: 0.2rem 0; font-weight: 600; }
	.empty small { opacity: 0.7; font-size: 0.8rem; }

	.dupes, .trades {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.dupes a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.85rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--border);
		border-radius: 12px;
		text-decoration: none;
		color: var(--text);
		transition: transform 0.18s, border-color 0.2s;
	}
	.dupes a:active { transform: scale(0.98); }
	.dupes a:hover { border-color: var(--accent-2); }
	.dupe-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.code {
		font-size: 0.65rem;
		color: var(--gold);
		letter-spacing: 1px;
		font-weight: 700;
	}
	.label {
		font-weight: 700;
		font-size: 0.95rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.qty {
		background: linear-gradient(135deg, #06b6d4, #3b82f6);
		padding: 0.3rem 0.7rem;
		border-radius: 14px;
		font-weight: 800;
		font-size: 0.9rem;
		color: white;
		box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
	}

	.trades li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.4rem;
		font-size: 0.88rem;
		border-bottom: 1px solid var(--border);
	}
	.trades li:last-child { border-bottom: none; }
	.trades a {
		color: var(--text);
		text-decoration: none;
		display: inline-flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}
	.trades a strong { color: var(--gold); font-size: 0.7rem; letter-spacing: 1px; }
	.kind {
		width: 26px; height: 26px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 0.85rem;
		flex-shrink: 0;
		color: white;
		font-weight: 800;
	}
	.kind.in { background: var(--good); }
	.kind.out { background: var(--warn); }
	.who { color: var(--muted); font-size: 0.78rem; }
	.date { margin-left: auto; color: var(--muted); font-size: 0.72rem; }

	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0 0 0.7rem;
	}
	.backup-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.primary, .secondary {
		padding: 0.8rem;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		font-family: inherit;
	}
	.primary {
		background: linear-gradient(135deg, #22c55e, #16a34a);
		color: white;
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
	}
	.secondary {
		background: transparent;
		border: 2px solid var(--accent-2);
		color: var(--accent-2);
	}
	.primary:active, .secondary:active { transform: scale(0.96); }
	.secondary.disabled { opacity: 0.6; cursor: not-allowed; }
	.msg {
		margin: 0.6rem 0 0;
		padding: 0.6rem 0.9rem;
		background: rgba(34, 197, 94, 0.1);
		border-left: 3px solid var(--good);
		border-radius: 6px;
		font-size: 0.88rem;
	}
</style>
