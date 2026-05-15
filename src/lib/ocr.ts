import type { Sticker } from './types';

let workerPromise: Promise<import('tesseract.js').Worker> | undefined;

async function getWorker() {
	if (!workerPromise) {
		workerPromise = (async () => {
			const { createWorker } = await import('tesseract.js');
			const w = await createWorker('eng');
			await w.setParameters({
				tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
				tessedit_pageseg_mode: '7' as any
			});
			return w;
		})();
	}
	return workerPromise;
}

export interface OcrResult {
	rawText: string;
	codes: string[];
	matches: Sticker[];
	bestMatch?: Sticker;
	confidence: 'high' | 'low' | 'none';
}

const CODE_PATTERNS = [
	/\b([A-L][1-4])[-\s]?(\d{1,2})\b/g,
	/\bFWC[-\s]?(\d{2,3})\b/gi
];

function extractCodes(text: string): string[] {
	const found = new Set<string>();
	const cleaned = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, ' ');

	for (const re of CODE_PATTERNS) {
		const r = new RegExp(re.source, re.flags);
		let m;
		while ((m = r.exec(cleaned)) !== null) {
			if (m[0].startsWith('FWC')) {
				const n = m[1].padStart(3, '0');
				found.add(`FWC${n}`);
			} else {
				const num = m[2].padStart(2, '0');
				found.add(`${m[1]}-${num}`);
			}
		}
	}
	return [...found];
}

export async function recognizeSticker(image: File | Blob, stickers: Sticker[]): Promise<OcrResult> {
	const worker = await getWorker();
	const { data } = await worker.recognize(image);
	const rawText = data.text ?? '';
	const codes = extractCodes(rawText);

	const stickerByCode = new Map(stickers.map((s) => [s.code.toUpperCase(), s]));
	const matches: Sticker[] = [];
	for (const code of codes) {
		const hit = stickerByCode.get(code);
		if (hit) matches.push(hit);
	}

	let confidence: OcrResult['confidence'] = 'none';
	if (matches.length === 1) confidence = 'high';
	else if (matches.length > 1) confidence = 'low';

	return { rawText, codes, matches, bestMatch: matches[0], confidence };
}

export async function terminateOcr() {
	if (!workerPromise) return;
	const w = await workerPromise;
	await w.terminate();
	workerPromise = undefined;
}
