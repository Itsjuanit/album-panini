const GEMINI_MODEL = 'gemini-flash-latest';

const PROMPT = `Look at this Panini FIFA World Cup 2026 sticker image. Find the sticker code printed on it.

The code has format "XXX N" or "XXX NN":
- XXX = three uppercase letters (country code like URU, ARG, BRA, FRA, ESP)
- N or NN = a number from 0 to 26
- Usually appears in a dark/black pill or label on the back of the sticker, top-right

Examples on the sticker: "URU 6", "URU 7", "ARG 17", "BRA 23", "FRA 0"

YOUR RESPONSE FORMAT — ONE LINE, NOTHING ELSE:
- If you read both letters and number: XXX-NN (zero-padded). Example: "URU 7" → URU-07
- If you read only the 3 letters but the number is unreadable/blurry: XXX-?? . Example: URU-??
- If you cannot read 3 letters either: UNKNOWN

Do not include quotes, explanation, or any other text. Just the code.`;

interface GeminiResponse {
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
	}>;
	error?: { message?: string };
}

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		return jsonResponse({ error: 'GEMINI_API_KEY no configurada' }, 500);
	}

	let body: { imageBase64?: string; mimeType?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: 'JSON inválido' }, 400);
	}

	const { imageBase64, mimeType = 'image/jpeg' } = body;
	if (!imageBase64) {
		return jsonResponse({ error: 'Falta imageBase64' }, 400);
	}

	const payload = {
		contents: [
			{
				role: 'user',
				parts: [
					{ text: PROMPT },
					{ inline_data: { mime_type: mimeType, data: imageBase64 } }
				]
			}
		],
		generationConfig: {
			temperature: 0.1,
			maxOutputTokens: 30
		}
	};

	let gem: GeminiResponse;
	try {
		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-goog-api-key': apiKey
				},
				body: JSON.stringify(payload)
			}
		);
		gem = await res.json();
		if (!res.ok) {
			return jsonResponse({ error: gem.error?.message ?? `Gemini ${res.status}` }, 502);
		}
	} catch (e) {
		return jsonResponse({ error: 'Error llamando a Gemini' }, 502);
	}

	const text = gem.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
	const upper = text.toUpperCase();

	if (/^UNKNOWN/i.test(text)) {
		return jsonResponse({ raw: text, code: null, country: null });
	}

	const fullMatch = upper.match(/\b([A-Z]{3})[-\s]?(\d{1,3})\b/);
	if (fullMatch && fullMatch[1] !== 'FWC') {
		const code = `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}`;
		return jsonResponse({ raw: text, code, country: fullMatch[1] });
	}

	const fwcMatch = upper.match(/\bFWC[-\s]?(\d{1,3})\b/);
	if (fwcMatch) {
		return jsonResponse({ raw: text, code: `FWC${fwcMatch[1].padStart(3, '0')}`, country: null });
	}

	const countryOnly = upper.match(/\b([A-Z]{3})\b[-\s]*\??/);
	if (countryOnly && countryOnly[1] !== 'FWC') {
		return jsonResponse({ raw: text, code: null, country: countryOnly[1] });
	}

	return jsonResponse({ raw: text, code: null, country: null });
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
