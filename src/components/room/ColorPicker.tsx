'use client';

import { PLAYER_COLORS } from '@/lib/constants';

/** Human-readable names for the player color palette. */
const COLOR_NAMES: Record<string, string> = {
  '#E53E3E': 'Rot',
  '#3182CE': 'Blau',
  '#38A169': 'Grün',
  '#D69E2E': 'Gelb',
  '#805AD5': 'Lila',
  '#DD6B20': 'Orange',
  '#319795': 'Türkis',
  '#D53F8C': 'Pink',
};

export interface ColorPickerProps {
  /** Colors that are already taken and cannot be selected. */
  takenColors: string[];
  /** The currently selected color (hex string) or null if none selected. */
  selectedColor: string | null;
  /** Called when the user picks an available color. */
  onSelect: (color: string) => void;
}

export default function ColorPicker({
  takenColors,
  selectedColor,
  onSelect,
}: ColorPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Farbe wählen"
      className="grid grid-cols-4 justify-items-center gap-3"
    >
      {PLAYER_COLORS.map((color) => {
        const isTaken = takenColors.includes(color);
        const isSelected = selectedColor === color;
        const label = COLOR_NAMES[color] ?? color;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            disabled={isTaken}
            title={isTaken ? `${label} (vergeben)` : label}
            onClick={() => onSelect(color)}
            className={`
              relative h-10 w-10 rounded-full border-2 transition-all duration-150
              focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900
              ${
                isTaken
                  ? 'cursor-not-allowed border-gray-600 opacity-30 grayscale'
                  : isSelected
                    ? 'scale-110 border-amber-400 shadow-[0_0_8px_rgba(217,168,60,0.6)]'
                    : 'border-transparent hover:scale-105 hover:border-white/40'
              }
            `}
            style={{ backgroundColor: color }}
          >
            {/* Strikethrough line for taken colors */}
            {isTaken && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="block h-0.5 w-7 rotate-45 rounded bg-gray-400" />
              </span>
            )}

            {/* Check mark for selected color */}
            {isSelected && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
