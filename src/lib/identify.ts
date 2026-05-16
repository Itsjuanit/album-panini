import { db } from './db';
import type { Sticker } from './types';

export interface IdentifyResult {
	rawText: string;
	matches: Sticker[];
	bestMatch?: Sticker;
	confidence: 'high' | 'low' | 'none';
	source: 'ai' | 'ocr';
}

async function fileToBase64(file: Blob): Promise<{ base64: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const [meta, b64] = dataUrl.split(',');
			const mimeMatch = meta.match(/data:([^;]+);/);
			resolve({ base64: b64, mimeType: mimeMatch?.[1] ?? 'image/jpeg' });
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export async function identifyWithAI(image: Blob): Promise<IdentifyResult> {
	const { base64, mimeType } = await fileToBase64(image);

	const res = await fetch('/api/identify', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ imageBase64: base64, mimeType })
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
		throw new Error(err.error ?? `HTTP ${res.status}`);
	}

	const { raw, code }: { raw: string; code: string | null } = await res.json();
	const stickers = await db.stickers.toArray();

	if (!code) {
		return { rawText: raw, matches: [], confidence: 'none', source: 'ai' };
	}

	const byCode = new Map(stickers.map((s) => [s.code.toUpperCase(), s]));
	const direct = byCode.get(code);
	if (direct) {
		return { rawText: raw, matches: [direct], bestMatch: direct, confidence: 'high', source: 'ai' };
	}

	const [, prefix, num] = code.match(/^([A-Z]{3})-(\d+)$/) ?? [];
	if (prefix && num) {
		const fallback = stickers.find((s) => s.code.toUpperCase() === `${prefix}-${num.padStart(2, '0')}`);
		if (fallback) {
			return {
				rawText: raw,
				matches: [fallback],
				bestMatch: fallback,
				confidence: 'high',
				source: 'ai'
			};
		}

		const nearby = stickers.filter((s) => s.code.toUpperCase().startsWith(`${prefix}-`));
		if (nearby.length) {
			return { rawText: raw, matches: nearby.slice(0, 4), confidence: 'low', source: 'ai' };
		}
	}

	return { rawText: raw, matches: [], confidence: 'none', source: 'ai' };
}
