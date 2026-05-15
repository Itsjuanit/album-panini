import type { Sticker } from './types';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const TEAM_BY_SLOT: Record<string, string> = {
	A1: 'México',         A2: 'Sudáfrica',         A3: 'Corea del Sur',   A4: 'República Checa',
	B1: 'Canadá',         B2: 'Bosnia y Herzegovina', B3: 'Qatar',         B4: 'Suiza',
	C1: 'Brasil',         C2: 'Marruecos',         C3: 'Haití',           C4: 'Escocia',
	D1: 'Estados Unidos', D2: 'Paraguay',          D3: 'Australia',       D4: 'Türkiye',
	E1: 'Alemania',       E2: 'Curazao',           E3: 'Costa de Marfil', E4: 'Ecuador',
	F1: 'Países Bajos',   F2: 'Japón',             F3: 'Suecia',          F4: 'Túnez',
	G1: 'Bélgica',        G2: 'Egipto',            G3: 'Irán',            G4: 'Nueva Zelanda',
	H1: 'España',         H2: 'Cabo Verde',        H3: 'Arabia Saudita',  H4: 'Uruguay',
	I1: 'Francia',        I2: 'Senegal',           I3: 'Irak',            I4: 'Noruega',
	J1: 'Argentina',      J2: 'Argelia',           J3: 'Austria',         J4: 'Jordania',
	K1: 'Portugal',       K2: 'R. D. del Congo',   K3: 'Uzbekistán',      K4: 'Colombia',
	L1: 'Inglaterra',     L2: 'Croacia',           L3: 'Ghana',           L4: 'Panamá'
};

export function buildChecklist(): Sticker[] {
	const list: Sticker[] = [];
	let id = 1;

	const intros = [
		'Tapa del álbum',
		'Trofeo FIFA',
		'Mascota oficial',
		'Logo Mundial 2026',
		'Balón oficial',
		'Estadio inaugural',
		'Estadio final',
		'Ciudad sede 1',
		'Ciudad sede 2',
		'Ciudad sede 3',
		'Ciudad sede 4',
		'Ciudad sede 5',
		'Ciudad sede 6',
		'Ciudad sede 7',
		'Ciudad sede 8',
		'Historia del Mundial',
		'Campeones anteriores',
		'Leyendas',
		'Árbitros',
		'Voluntarios'
	];
	intros.forEach((label, i) => {
		list.push({
			id: id++,
			code: `FWC${String(id - 1).padStart(3, '0')}`,
			team: 'Intro',
			group: '—',
			role: 'intro',
			label
		});
	});

	for (const g of GROUPS) {
		for (let t = 1; t <= 4; t++) {
			const slot = `${g}${t}`;
			const teamName = TEAM_BY_SLOT[slot] ?? `Equipo ${slot}`;
			list.push({
				id: id++,
				code: `${slot}-01`,
				team: teamName,
				group: g,
				role: 'crest',
				label: 'Escudo'
			});
			list.push({
				id: id++,
				code: `${slot}-02`,
				team: teamName,
				group: g,
				role: 'team-photo',
				label: 'Foto del equipo'
			});
			for (let p = 1; p <= 18; p++) {
				list.push({
					id: id++,
					code: `${slot}-${String(p + 2).padStart(2, '0')}`,
					team: teamName,
					group: g,
					role: 'player',
					label: `Jugador ${p}`
				});
			}
		}
	}

	return list;
}

export const TOTAL_STICKERS = 980;
