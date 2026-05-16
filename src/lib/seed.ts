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

export const CODE_BY_SLOT: Record<string, string> = {
	A1: 'MEX', A2: 'RSA', A3: 'KOR', A4: 'CZE',
	B1: 'CAN', B2: 'BIH', B3: 'QAT', B4: 'SUI',
	C1: 'BRA', C2: 'MAR', C3: 'HAI', C4: 'SCO',
	D1: 'USA', D2: 'PAR', D3: 'AUS', D4: 'TUR',
	E1: 'GER', E2: 'CUW', E3: 'CIV', E4: 'ECU',
	F1: 'NED', F2: 'JPN', F3: 'SWE', F4: 'TUN',
	G1: 'BEL', G2: 'EGY', G3: 'IRN', G4: 'NZL',
	H1: 'ESP', H2: 'CPV', H3: 'KSA', H4: 'URU',
	I1: 'FRA', I2: 'SEN', I3: 'IRQ', I4: 'NOR',
	J1: 'ARG', J2: 'ALG', J3: 'AUT', J4: 'JOR',
	K1: 'POR', K2: 'COD', K3: 'UZB', K4: 'COL',
	L1: 'ENG', L2: 'CRO', L3: 'GHA', L4: 'PAN'
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
			const teamCode = CODE_BY_SLOT[slot] ?? slot;
			for (let n = 0; n <= 26; n++) {
				const code = `${teamCode}-${String(n).padStart(2, '0')}`;
				const role: 'crest' | 'player' = n === 0 ? 'crest' : 'player';
				const label = n === 0 ? 'Escudo' : `Figurita ${String(n).padStart(2, '0')}`;
				list.push({ id: id++, code, team: teamName, group: g, role, label });
			}
		}
	}

	return list;
}

export const STICKERS_PER_TEAM = 27;
export const INTRO_COUNT = 20;

export function slotForId(id: number): string | null {
	if (id <= INTRO_COUNT) return null;
	const teamIndex = Math.floor((id - INTRO_COUNT - 1) / STICKERS_PER_TEAM);
	const groupIndex = Math.floor(teamIndex / 4);
	const inGroup = (teamIndex % 4) + 1;
	if (groupIndex >= GROUPS.length) return null;
	return `${GROUPS[groupIndex]}${inGroup}`;
}

export const TOTAL_STICKERS = INTRO_COUNT + 48 * STICKERS_PER_TEAM;
