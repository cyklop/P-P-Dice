'use client';

import type { DiceSet } from '@/lib/types';

export interface DiceSetSelectorProps {
  sets: DiceSet[];
  onThrow: (setId: string) => void;
}

/** Format a dice set composition like "2D6 + 1D8". */
function formatComposition(set: DiceSet): string {
  return set.dice.map((d) => `${d.count}${d.type}`).join(' + ');
}

/** Small inline SVG icon representing a die face. */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className ?? 'h-4 w-4'}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

export default function DiceSetSelector({
  sets,
  onThrow,
}: DiceSetSelectorProps) {
  return (
    <div className="space-y-2">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary">
        Würfel-Sets
      </h3>

      {sets.length === 0 && (
        <p className="py-4 text-center text-sm text-text-muted">
          Noch keine Sets erstellt.
        </p>
      )}

      <div className="space-y-1.5">
        {sets.map((set) => (
          <div
            key={set.id}
            className="fantasy-border flex items-center gap-2 rounded-lg border-border-fantasy/40 bg-bg-light/60 px-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-text">
                {set.name}
              </span>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                <DiceIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{formatComposition(set)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onThrow(set.id)}
              className="shrink-0 rounded-lg border border-amber-700/60 bg-gradient-to-b from-amber-700 to-amber-900 px-3 py-1.5 text-sm font-bold text-amber-100 shadow-md shadow-amber-900/40 transition-all duration-150 hover:from-amber-600 hover:to-amber-800 active:scale-[0.97] glow-amber"
            >
              Würfeln
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
