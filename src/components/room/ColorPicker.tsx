'use client';

import { useTranslations } from 'next-intl';
import { PLAYER_COLORS } from '@/lib/constants';

export interface ColorPickerProps {
  takenColors: string[];
  selectedColor: string | null;
  onSelect: (color: string) => void;
}

export default function ColorPicker({
  takenColors,
  selectedColor,
  onSelect,
}: ColorPickerProps) {
  const t = useTranslations('colors');

  return (
    <div
      role="radiogroup"
      aria-label={t('choose')}
      className="grid grid-cols-4 justify-items-center gap-3"
    >
      {PLAYER_COLORS.map((color) => {
        const isTaken = takenColors.includes(color);
        const isSelected = selectedColor === color;
        const label = t(color);

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            disabled={isTaken}
            title={isTaken ? t('taken', { color: label }) : label}
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
            {isTaken && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="block h-0.5 w-7 rotate-45 rounded bg-gray-400" />
              </span>
            )}

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
