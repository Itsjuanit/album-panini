import { supabase } from './supabase';
import { db } from './db';
import type { Sticker, StickerStatus } from './types';

let suppressPush = false;

export function isSyncing() {
	return suppressPush;
}

export async function pullFromCloud() {
	suppressPush = true;
	try {
		const { data: states, error: e1 } = await supabase
			.from('sticker_states')
			.select('sticker_id, status, duplicates, notes, updated_at');
		if (e1) throw e1;

		const { data: trades, error: e2 } = await supabase
			.from('trades')
			.select('id, sticker_id, kind, with_whom, notes, occurred_at');
		if (e2) throw e2;

		const { data: teamNames, error: e3 } = await supabase
			.from('team_names')
			.select('group_slot, custom_name');
		if (e3) throw e3;

		const { data: playerNames, error: e4 } = await supabase
			.from('player_names')
			.select('sticker_id, custom_label');
		if (e4) throw e4;

		await db.transaction('rw', db.states, db.trades, db.stickers, db.teams, async () => {
			const allStates = await db.states.toArray();
			const localById = new Map(allStates.map((s) => [s.id, s]));
			const remoteIds = new Set<number>();

			for (const r of states ?? []) {
				remoteIds.add(r.sticker_id);
				const local = localById.get(r.sticker_id);
				await db.states.put({
					id: r.sticker_id,
					status: r.status as StickerStatus,
					duplicates: r.duplicates ?? 0,
					notes: r.notes ?? undefined,
					photoBlob: local?.photoBlob,
					updatedAt: new Date(r.updated_at).getTime()
				});
			}

			for (const s of allStates) {
				if (!remoteIds.has(s.id)) {
					await db.states.put({
						id: s.id,
						status: 'missing',
						duplicates: 0,
						notes: undefined,
						photoBlob: s.photoBlob,
						updatedAt: Date.now()
					});
				}
			}

			await db.trades.clear();
			if (trades && trades.length) {
				await db.trades.bulkAdd(
					trades.map((t) => ({
						id: t.id,
						stickerId: t.sticker_id,
						kind: t.kind as 'in' | 'out',
						withWhom: t.with_whom,
						notes: t.notes ?? undefined,
						date: new Date(t.occurred_at).getTime()
					}))
				);
			}

			const allStickers = await db.stickers.toArray();
			const teamBySlot = new Map<string, string>();
			for (const s of allStickers) {
				if (s.role === 'intro') continue;
				const slot = s.code.split('-')[0];
				if (!teamBySlot.has(slot)) teamBySlot.set(slot, s.team);
			}

			for (const tn of teamNames ?? []) {
				const oldName = teamBySlot.get(tn.group_slot);
				if (!oldName || oldName === tn.custom_name) continue;
				await db.stickers
					.where('team')
					.equals(oldName)
					.modify({ team: tn.custom_name });
				const t = await db.teams.get(oldName);
				if (t) {
					await db.teams.delete(oldName);
					await db.teams.put({ ...t, name: tn.custom_name, customName: tn.custom_name });
				}
			}

			for (const pn of playerNames ?? []) {
				await db.stickers.update(pn.sticker_id, { label: pn.custom_label });
			}
		});
	} finally {
		suppressPush = false;
	}
}

export async function pushState(id: number) {
	if (suppressPush) return;
	const user = (await supabase.auth.getUser()).data.user;
	if (!user) return;
	const st = await db.states.get(id);
	if (!st) return;
	await supabase.from('sticker_states').upsert(
		{
			user_id: user.id,
			sticker_id: id,
			status: st.status,
			duplicates: st.duplicates ?? 0,
			notes: st.notes ?? null,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id,sticker_id' }
	);
}

export async function pushTrade(
	stickerId: number,
	kind: 'in' | 'out',
	withWhom: string,
	notes?: string
) {
	if (suppressPush) return null;
	const user = (await supabase.auth.getUser()).data.user;
	if (!user) return null;
	const { data } = await supabase
		.from('trades')
		.insert({
			user_id: user.id,
			sticker_id: stickerId,
			kind,
			with_whom: withWhom,
			notes: notes ?? null
		})
		.select('id')
		.single();
	return data?.id ?? null;
}

export async function pushTeamRename(slot: string, customName: string) {
	if (suppressPush) return;
	const user = (await supabase.auth.getUser()).data.user;
	if (!user) return;
	await supabase.from('team_names').upsert(
		{
			user_id: user.id,
			group_slot: slot,
			custom_name: customName,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id,group_slot' }
	);
}

export async function pushPlayerLabel(stickerId: number, label: string) {
	if (suppressPush) return;
	const user = (await supabase.auth.getUser()).data.user;
	if (!user) return;
	await supabase.from('player_names').upsert(
		{
			user_id: user.id,
			sticker_id: stickerId,
			custom_label: label,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id,sticker_id' }
	);
}

export async function pushAllLocalToCloud() {
	suppressPush = true;
	try {
		const user = (await supabase.auth.getUser()).data.user;
		if (!user) return;

		const states = await db.states.toArray();
		const meaningful = states.filter(
			(s) => s.status !== 'missing' || (s.duplicates ?? 0) > 0 || (s.notes && s.notes.length > 0)
		);
		if (meaningful.length) {
			await supabase.from('sticker_states').upsert(
				meaningful.map((s) => ({
					user_id: user.id,
					sticker_id: s.id,
					status: s.status,
					duplicates: s.duplicates ?? 0,
					notes: s.notes ?? null,
					updated_at: new Date(s.updatedAt).toISOString()
				})),
				{ onConflict: 'user_id,sticker_id' }
			);
		}

		const trades = await db.trades.toArray();
		if (trades.length) {
			await supabase.from('trades').insert(
				trades.map((t) => ({
					user_id: user.id,
					sticker_id: t.stickerId,
					kind: t.kind,
					with_whom: t.withWhom,
					notes: t.notes ?? null,
					occurred_at: new Date(t.date).toISOString()
				}))
			);
		}

		const stickers = await db.stickers.toArray();
		const teamsBySlot = new Map<string, string>();
		for (const s of stickers) {
			if (s.role === 'intro') continue;
			const slot = s.code.split('-')[0];
			if (!teamsBySlot.has(slot)) teamsBySlot.set(slot, s.team);
		}
		const teamRows = [...teamsBySlot.entries()]
			.filter(([slot, name]) => name && !name.startsWith('Equipo '))
			.map(([slot, name]) => ({
				user_id: user.id,
				group_slot: slot,
				custom_name: name
			}));
		if (teamRows.length) {
			await supabase
				.from('team_names')
				.upsert(teamRows, { onConflict: 'user_id,group_slot' });
		}

		const playerRows = stickers
			.filter((s) => s.role === 'player' && !/^Jugador \d+$/.test(s.label))
			.map((s) => ({ user_id: user.id, sticker_id: s.id, custom_label: s.label }));
		if (playerRows.length) {
			await supabase
				.from('player_names')
				.upsert(playerRows, { onConflict: 'user_id,sticker_id' });
		}
	} finally {
		suppressPush = false;
	}
}

export async function wipeCloudData(): Promise<void> {
	const user = (await supabase.auth.getUser()).data.user;
	if (!user) return;
	await Promise.all([
		supabase.from('sticker_states').delete().eq('user_id', user.id),
		supabase.from('trades').delete().eq('user_id', user.id),
		supabase.from('team_names').delete().eq('user_id', user.id),
		supabase.from('player_names').delete().eq('user_id', user.id)
	]);
}

export async function maybePendingCloudWipe(): Promise<boolean> {
	if (typeof localStorage === 'undefined') return false;
	if (!localStorage.getItem('album-pending-cloud-wipe')) return false;
	await wipeCloudData();
	localStorage.removeItem('album-pending-cloud-wipe');
	return true;
}

export async function clearLocalUserData() {
	suppressPush = true;
	try {
		await db.transaction('rw', db.states, db.trades, async () => {
			const states = await db.states.toArray();
			for (const s of states) {
				await db.states.put({
					id: s.id,
					status: 'missing',
					duplicates: 0,
					updatedAt: Date.now()
				});
			}
			await db.trades.clear();
		});
	} finally {
		suppressPush = false;
	}
}

export async function cloudHasData(): Promise<boolean> {
	const { count } = await supabase
		.from('sticker_states')
		.select('sticker_id', { count: 'exact', head: true });
	return (count ?? 0) > 0;
}

export async function localHasMeaningfulData(): Promise<boolean> {
	const states = await db.states.toArray();
	return states.some(
		(s) => s.status !== 'missing' || (s.duplicates ?? 0) > 0 || (s.notes && s.notes.length > 0)
	);
}
