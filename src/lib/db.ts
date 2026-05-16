import Dexie, { type Table } from 'dexie';
import type { Sticker, StickerState, TradeLog, Team } from './types';
import { buildChecklist, TEAM_BY_SLOT, CODE_BY_SLOT, slotForId } from './seed';
import { pushState, pushTrade, pushTeamRename, pushPlayerLabel } from './sync';

export class AlbumDB extends Dexie {
	stickers!: Table<Sticker, number>;
	states!: Table<StickerState, number>;
	trades!: Table<TradeLog, number>;
	teams!: Table<Team, string>;

	constructor() {
		super('album-panini-2026');
		this.version(1).stores({
			stickers: 'id, team, group, role',
			states: 'id, status',
			trades: '++id, stickerId, date',
			teams: 'name, group'
		});
	}
}

export const db = new AlbumDB();

let seeded = false;
export async function ensureSeeded() {
	if (seeded) return;
	const count = await db.stickers.count();
	if (count === 0) {
		const list = buildChecklist();
		await db.stickers.bulkAdd(list);
		await db.states.bulkAdd(
			list.map((s) => ({
				id: s.id,
				status: 'missing' as const,
				duplicates: 0,
				updatedAt: Date.now()
			}))
		);
		const teamNames = new Map<string, Team>();
		for (const s of list) {
			if (s.role === 'intro') continue;
			if (!teamNames.has(s.team)) {
				teamNames.set(s.team, { name: s.team, group: s.group });
			}
		}
		await db.teams.bulkAdd([...teamNames.values()]);
	} else {
		await syncTeamNamesFromSeed();
		await migrateStickerCodesToFifa();
	}
	seeded = true;
}

async function migrateStickerCodesToFifa() {
	const sample = await db.stickers.where('id').between(21, 40).first();
	if (!sample) return;
	if (/^[A-Z]{3}-\d{2}$/.test(sample.code)) return;

	await db.transaction('rw', db.stickers, async () => {
		const stickers = await db.stickers.toArray();
		for (const s of stickers) {
			if (s.role === 'intro') continue;
			if (/^[A-Z]{3}-\d{2}$/.test(s.code)) continue;
			const slot = slotForId(s.id);
			if (!slot) continue;
			const code3 = CODE_BY_SLOT[slot];
			if (!code3) continue;
			const numPart = s.code.split('-')[1] ?? String(((s.id - 21) % 20) + 1).padStart(2, '0');
			await db.stickers.update(s.id, { code: `${code3}-${numPart}` });
		}
	});
}

async function syncTeamNamesFromSeed() {
	await db.transaction('rw', db.stickers, db.teams, async () => {
		const stickers = await db.stickers.toArray();
		const renames = new Map<string, string>();
		for (const s of stickers) {
			if (s.role === 'intro') continue;
			const slot = s.code.split('-')[0];
			const real = TEAM_BY_SLOT[slot];
			if (!real) continue;
			if (s.team === real) continue;
			if (s.team.startsWith('Equipo ')) renames.set(s.team, real);
		}
		for (const [oldName, newName] of renames) {
			await db.stickers.where('team').equals(oldName).modify({ team: newName });
			const t = await db.teams.get(oldName);
			if (t) {
				await db.teams.delete(oldName);
				await db.teams.put({ ...t, name: newName });
			}
		}
	});
}

export async function setStatus(id: number, status: StickerState['status']) {
	await db.states.update(id, { status, updatedAt: Date.now() });
	pushState(id).catch(console.error);
}

export async function setDuplicates(id: number, duplicates: number) {
	const status = duplicates > 0 ? 'duplicate' : 'owned';
	await db.states.update(id, { duplicates: Math.max(0, duplicates), status, updatedAt: Date.now() });
	pushState(id).catch(console.error);
}

export async function setPhoto(id: number, blob: Blob | undefined) {
	await db.states.update(id, { photoBlob: blob, updatedAt: Date.now() });
}

export async function setNotes(id: number, notes: string) {
	await db.states.update(id, { notes, updatedAt: Date.now() });
	pushState(id).catch(console.error);
}

export async function setStickerLabel(id: number, label: string) {
	await db.stickers.update(id, { label });
	const s = await db.stickers.get(id);
	if (s?.role === 'player') pushPlayerLabel(id, label).catch(console.error);
}

export async function renameTeam(oldName: string, newName: string) {
	if (oldName === newName) return;
	let slot: string | undefined;
	await db.transaction('rw', db.stickers, db.teams, async () => {
		const someSticker = await db.stickers.where('team').equals(oldName).first();
		slot = someSticker?.code.split('-')[0];
		await db.stickers.where('team').equals(oldName).modify({ team: newName });
		const t = await db.teams.get(oldName);
		if (t) {
			await db.teams.delete(oldName);
			await db.teams.put({ ...t, name: newName, customName: newName });
		}
	});
	if (slot) pushTeamRename(slot, newName).catch(console.error);
}

export async function addTrade(
	stickerId: number,
	kind: 'in' | 'out',
	withWhom: string,
	notes?: string
) {
	const localId = await db.trades.add({
		stickerId,
		kind,
		withWhom,
		notes,
		date: Date.now()
	});
	pushTrade(stickerId, kind, withWhom, notes).catch(console.error);
	return localId;
}

export async function exportAll() {
	const [stickers, states, trades, teams] = await Promise.all([
		db.stickers.toArray(),
		db.states.toArray(),
		db.trades.toArray(),
		db.teams.toArray()
	]);
	const statesSerialized = await Promise.all(
		states.map(async (s) => ({
			...s,
			photoBlob: s.photoBlob ? await blobToDataUrl(s.photoBlob) : undefined
		}))
	);
	return JSON.stringify({ version: 1, stickers, states: statesSerialized, trades, teams }, null, 2);
}

export async function importAll(json: string) {
	const data = JSON.parse(json);
	if (data.version !== 1) throw new Error('Versión de respaldo no soportada');
	await db.transaction('rw', db.stickers, db.states, db.trades, db.teams, async () => {
		await Promise.all([db.stickers.clear(), db.states.clear(), db.trades.clear(), db.teams.clear()]);
		await db.stickers.bulkAdd(data.stickers);
		const states = await Promise.all(
			(data.states as Array<StickerState & { photoBlob?: string }>).map(async (s) => ({
				...s,
				photoBlob: s.photoBlob ? await dataUrlToBlob(s.photoBlob) : undefined
			}))
		);
		await db.states.bulkAdd(states);
		await db.trades.bulkAdd(data.trades);
		await db.teams.bulkAdd(data.teams);
	});
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const res = await fetch(dataUrl);
	return res.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}
