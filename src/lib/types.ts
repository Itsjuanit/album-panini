export type StickerStatus = 'missing' | 'owned' | 'duplicate';

export interface Sticker {
	id: number;
	code: string;
	team: string;
	group: string;
	role: 'intro' | 'crest' | 'team-photo' | 'player' | 'special';
	label: string;
}

export interface StickerState {
	id: number;
	status: StickerStatus;
	duplicates: number;
	photoBlob?: Blob;
	notes?: string;
	updatedAt: number;
}

export interface TradeLog {
	id?: number;
	stickerId: number;
	kind: 'in' | 'out';
	withWhom: string;
	date: number;
	notes?: string;
}

export interface Team {
	name: string;
	group: string;
	customName?: string;
}
