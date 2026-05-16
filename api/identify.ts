const GEMINI_MODEL = 'gemini-flash-latest';

const PROMPT = `Mirá esta figurita del álbum Panini FIFA World Cup 2026.

OBJETIVO: leer el código de la figurita. Está en una pastilla NEGRA con texto blanco, generalmente arriba a la derecha del dorso.

El código tiene DOS PARTES, ambas obligatorias:
- 3 LETRAS = código FIFA del país (ARG, BRA, URU, MEX, USA, GER, ESP, FRA, POR, NED, BEL, ENG, CRO, JPN, KOR, MAR, AUS, COL, ITA, RUS, etc.)
- 1 O 2 DÍGITOS = número del 0 al 26 (puede ser 0, 5, 11, 26)

EJEMPLOS de códigos válidos en formato real (lo que verías en la figurita):
- "URU 7"   -> respondé "URU-07"
- "URU 14"  -> respondé "URU-14"
- "ARG 0"   -> respondé "ARG-00"
- "BRA 23"  -> respondé "BRA-23"

INSTRUCCIONES OBLIGATORIAS:
1. Mirá con MUCHA atención el numerito al lado/abajo del código de país. Puede ser muy chico, de 1 solo dígito.
2. Si ves SOLAMENTE las 3 letras pero no podés leer claramente el número, AÚN ASÍ respondé las 3 letras seguidas de "-?" (ej: "URU-?"). NO devuelvas UNKNOWN si al menos viste las 3 letras.
3. NO confundas con: "PANINI", "FIFA", "2026", "INDUSTRIA ARGENTINA", número de fabricante de 5-6 dígitos como "005460", nombre del jugador, año de nacimiento, dorsal.
4. NO pongas comillas, comillas simples ni espacios extra alrededor.

FORMATO DE RESPUESTA:
- Si leíste código + número: SOLO el código en formato XXX-NN (ej: URU-07)
- Si leíste solo el país pero no el número: SOLO XXX-? (ej: URU-?)
- Si no leíste ni siquiera 3 letras: UNKNOWN

Respondé en UNA sola línea, sin más texto.`;

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
