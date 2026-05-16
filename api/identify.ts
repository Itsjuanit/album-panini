const GEMINI_MODEL = 'gemini-flash-latest';

const PROMPT = `Estás viendo una figurita del álbum Panini Mundial 2026.

Tu tarea: encontrar el código de la figurita. El formato es "XXX NN" donde:
- XXX es el código FIFA de 3 letras de la selección (ej: ARG, BRA, FRA, MEX, USA, GER, ESP, ITA, POR, NED, BEL, ENG, CRO, JPN, KOR, MAR, AUS, etc.)
- NN es un número de 1 a 20

Este código aparece impreso en la figurita, generalmente abajo o en el borde, a veces sobre el escudo.

NO confundas con:
- La palabra "PANINI" (es la marca)
- El año "2026"
- El nombre del jugador
- Texto del escudo de la selección

Respondé SOLAMENTE con el código en formato CODE-NUMBER (ej: ARG-17, BRA-05, MEX-01).
Si no podés identificarlo con seguridad, respondé exactamente: UNKNOWN`;

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
	const match = text.toUpperCase().match(/\b([A-Z]{3})[-\s]?(\d{1,3})\b/);

	if (!match || /UNKNOWN/i.test(text)) {
		return jsonResponse({ raw: text, code: null });
	}

	const code = `${match[1]}-${match[2].padStart(2, '0')}`;
	return jsonResponse({ raw: text, code });
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
