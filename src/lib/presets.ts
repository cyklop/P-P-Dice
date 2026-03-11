import type { DiceType } from './types';

export interface PresetSet {
  name: string;
  dice: { type: DiceType; count: number }[];
}

export interface PresetPackage {
  label: string;
  description: string;
  sets: PresetSet[];
}

/** User-defined preset stored in localStorage. */
export interface CustomPreset extends PresetPackage {
  id: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Custom preset persistence (localStorage)
// ---------------------------------------------------------------------------

const CUSTOM_PRESETS_KEY = 'pp-dice-custom-presets';

export function loadCustomPresets(): CustomPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(preset: CustomPreset): void {
  const existing = loadCustomPresets();
  existing.push(preset);
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
}

export function deleteCustomPreset(id: string): void {
  const existing = loadCustomPresets().filter((p) => p.id !== id);
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(existing));
}

// ---------------------------------------------------------------------------
// Generische Einzel-Presets
// ---------------------------------------------------------------------------

export const GENERIC_PRESETS: PresetSet[] = [
  { name: '1W4', dice: [{ type: 'D4', count: 1 }] },
  { name: '1W6', dice: [{ type: 'D6', count: 1 }] },
  { name: '2W6', dice: [{ type: 'D6', count: 2 }] },
  { name: '1W8', dice: [{ type: 'D8', count: 1 }] },
  { name: '1W10', dice: [{ type: 'D10', count: 1 }] },
  { name: '1W12', dice: [{ type: 'D12', count: 1 }] },
  { name: '1W20', dice: [{ type: 'D20', count: 1 }] },
  { name: '1W100', dice: [{ type: 'D10', count: 1 }, { type: 'D10X', count: 1 }] },
];

// ---------------------------------------------------------------------------
// RPG-System-Pakete
// ---------------------------------------------------------------------------

export const RPG_PRESETS: PresetPackage[] = [
  {
    label: 'D&D 5e',
    description: '7 Sets: Angriff, Schaden, Initiative, Rettungswurf u.a.',
    sets: [
      { name: 'Angriff', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Schaden (Nahkampf)', dice: [{ type: 'D8', count: 1 }] },
      { name: 'Schaden (Fernkampf)', dice: [{ type: 'D6', count: 1 }] },
      { name: 'Initiative', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Rettungswurf', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Fähigkeitscheck', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Sneak Attack', dice: [{ type: 'D6', count: 2 }] },
    ],
  },
  {
    label: 'DSA',
    description: '4 Sets: Eigenschaftsprobe (3W20), Schaden, Initiative, Bestätigung',
    sets: [
      { name: 'Eigenschaftsprobe', dice: [{ type: 'D20', count: 3 }] },
      { name: 'Schadenswurf', dice: [{ type: 'D6', count: 1 }] },
      { name: 'Initiative', dice: [{ type: 'D6', count: 1 }] },
      { name: 'Bestätigungswurf', dice: [{ type: 'D20', count: 1 }] },
    ],
  },
  {
    label: 'Pathfinder 2e',
    description: '6 Sets: Angriff, Schaden, Rettungswurf, Skill, Fireball, Heal',
    sets: [
      { name: 'Angriff', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Schaden (Schwert)', dice: [{ type: 'D8', count: 1 }] },
      { name: 'Rettungswurf', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Skill Check', dice: [{ type: 'D20', count: 1 }] },
      { name: 'Fireball (6d6)', dice: [{ type: 'D6', count: 6 }] },
      { name: 'Heal (2d10)', dice: [{ type: 'D10', count: 2 }] },
    ],
  },
  {
    label: 'Call of Cthulhu',
    description: '4 Sets: Fertigkeitsprobe (W100), Schaden, Trefferpunkte, Stabilitätsprobe',
    sets: [
      { name: 'Fertigkeitsprobe', dice: [{ type: 'D10', count: 1 }, { type: 'D10X', count: 1 }] },
      { name: 'Schaden', dice: [{ type: 'D6', count: 1 }] },
      { name: 'Bonus-/Strafwurf', dice: [{ type: 'D10X', count: 1 }] },
      { name: 'Stabilitätsprobe', dice: [{ type: 'D10', count: 1 }, { type: 'D10X', count: 1 }] },
    ],
  },
  {
    label: 'Shadowrun 5e',
    description: '4 Sets: Würfelpools von 6 bis 15 W6',
    sets: [
      { name: 'Kleiner Pool (6W6)', dice: [{ type: 'D6', count: 6 }] },
      { name: 'Mittlerer Pool (10W6)', dice: [{ type: 'D6', count: 10 }] },
      { name: 'Großer Pool (15W6)', dice: [{ type: 'D6', count: 15 }] },
      { name: 'Initiative (1W6)', dice: [{ type: 'D6', count: 1 }] },
    ],
  },
  {
    label: 'Savage Worlds',
    description: '4 Sets: Trait Check, Damage, Wild Die, Bennies',
    sets: [
      { name: 'Trait Check', dice: [{ type: 'D6', count: 1 }, { type: 'D8', count: 1 }] },
      { name: 'Damage', dice: [{ type: 'D6', count: 1 }] },
      { name: 'Wild Die Check', dice: [{ type: 'D6', count: 1 }, { type: 'D4', count: 1 }] },
      { name: 'Bennies', dice: [{ type: 'D6', count: 1 }] },
    ],
  },
  {
    label: 'Warhammer / WH40k',
    description: '4 Sets: Angriffe, Verwundung, Rüstungswurf, Moraltests',
    sets: [
      { name: 'Angriffe (10W6)', dice: [{ type: 'D6', count: 10 }] },
      { name: 'Verwundung (6W6)', dice: [{ type: 'D6', count: 6 }] },
      { name: 'Rüstungswurf (6W6)', dice: [{ type: 'D6', count: 6 }] },
      { name: 'Moraltest (2W6)', dice: [{ type: 'D6', count: 2 }] },
    ],
  },
  {
    label: 'FATE / Fudge',
    description: '1 Set: 4 Fudge-Würfel (simuliert mit 4W6)',
    sets: [
      { name: 'Fudge Wurf (4dF)', dice: [{ type: 'D6', count: 4 }] },
    ],
  },
];
