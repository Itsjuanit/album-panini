import { db } from './db';
import type { Sticker } from './types';

export interface IdentifyResult {
	rawText: string;
	matches: Sticker[];
	bestMatch?: Sticker;
	confidence: 'high' | 'low' | 'none';
	source: 'ai' | 'ocr';
}

async function compressImage(file: Blob, maxDim = 1280, quality = 0.85): Promise<Blob> {
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = reject;
			i.src = url;
		});

		const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
		const w = Math.round(img.naturalWidth * ratio);
		const h = Math.round(img.naturalHeight * ratio);

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('No canvas 2d');
		ctx.drawImage(img, 0, 0, w, h);

		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('toBlob falló'))),
				'image/jpeg',
				quality
			);
		});
	} finally {
		URL.revokeObjectURL(url);
	}
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
	let toSend: Blob = image;
	try {
		toSend = await compressImage(image, 1280, 0.85);
	} catch (e) {
		console.warn('Compresión falló, mando original:', e);
	}
	const { base64, mimeType } = await fileToBase64(toSend);

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
