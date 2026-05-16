const GEMINI_MODEL = 'gemini-flash-latest';

const PROMPT = `Estás viendo una figurita del álbum Panini FIFA World Cup 2026 (frente o dorso).

Tu tarea: encontrar el código identificador. Formato típico:
- 3 letras MAYÚSCULAS = código FIFA del país (ARG, BRA, FRA, URU, MEX, USA, GER, ESP, ITA, POR, NED, BEL, ENG, CRO, JPN, KOR, MAR, AUS, COL, CHI, PER, ECU, etc.)
- 1 o 2 dígitos = número del 1 al 20
- Entre las letras y el número puede haber espacio, guión o nada (ej: "ARG 17", "ARG-17", "ARG17", "URU7", "URU 7")

Dónde mirar:
- FRENTE: el código suele estar en una esquina o borde, en texto chico, a veces sobre el escudo
- DORSO: con el listado y datos, generalmente arriba, abajo, o al costado del nombre

IGNORÁ:
- "PANINI" (marca)
- "FIFA" / "WORLD CUP" / "2026"
- Nombre del jugador
- Año de nacimiento
- Números de camiseta (van con el nombre)
- Texto en el escudo

Respondé EXACTAMENTE con el código en formato CODE-NUMBER (ej: ARG-17, URU-07, BRA-05). Sin texto extra, sin comillas.
Solo si NO ves NADA que parezca a "3 letras + número", respondé: UNKNOWN`;

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
