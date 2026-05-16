const GEMINI_MODEL = 'gemini-flash-latest';

const PROMPT = `Estás viendo una figurita del álbum Panini FIFA World Cup 2026.

Tu ÚNICA tarea: encontrar el código identificador con formato "XXX N" o "XXX NN" donde:
- XXX = código FIFA de 3 letras del país (ARG, BRA, URU, MEX, USA, GER, ESP, FRA, POR, NED, BEL, ENG, CRO, JPN, KOR, MAR, AUS, COL, etc.)
- N o NN = número del 1 al 20

DÓNDE BUSCAR (en orden de prioridad):
1. DORSO de la figurita: hay una pastilla/badge NEGRA arriba a la DERECHA con texto blanco. Ej: "URU 6", "ARG 17", "BRA 11". ESTE ES EL LUGAR PRINCIPAL.
2. FRENTE de la figurita: borde inferior, texto chico

IGNORÁ COMPLETAMENTE (no son el código):
- "FIFA WORLD CUP 2026" (título)
- "PANINI" / "paninigroup" (marca)
- "OFFICIAL LICENSED PRODUCT"
- "INDUSTRIA ARGENTINA" / "MADE IN..." (lugar de fabricación — NO es código de país)
- Número de fabricante (5-6 dígitos como "005460")
- "Esta figurita es parte..." (legal)
- Nombre del jugador
- Año, dorsal, fecha de nacimiento

Si ves la pastilla negra arriba a la derecha con "XXX N" o "XXX NN", ESE es el código.

Respondé EXACTAMENTE con el código en formato CODE-NUMBER, ej: URU-06, ARG-17, BRA-05. Sin comillas, sin texto extra, sin explicación.
Si genuinamente no encontrás un patrón XXX+número, respondé: UNKNOWN`;

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
