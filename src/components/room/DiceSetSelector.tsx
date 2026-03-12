'use client';

import { useTranslations } from 'next-intl';
import type { DiceSet, RollMode, SimultaneousSubMode } from '@/lib/types';

export interface DiceSetSelectorProps {
  sets: DiceSet[];
  onThrow: (setId: string) => void;
  onReady?: (setId: string) => void;
  rollMode?: RollMode;
  simultaneousSubMode?: SimultaneousSubMode;
  throwLocked?: string | null;
  currentPlayerId?: string;
  isPlayerReady?: boolean;
  readyCount?: number;
  totalPlayers?: number;
  simultaneousSetId?: string | null;
  readyPlayerSets?: Record<string, string>;
}

function formatComposition(set: DiceSet): string {
  return set.dice.map((d) => `${d.count}${d.type}`).join(' + ');
}

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
  onReady,
  rollMode = 'free',
  simultaneousSubMode = 'same-set',
  throwLocked = null,
  currentPlayerId,
  isPlayerReady = false,
  readyCount = 0,
  totalPlayers = 1,
  simultaneousSetId = null,
  readyPlayerSets = {},
}: DiceSetSelectorProps) {
  const t = useTranslations('dice');

  const isSequentialLocked = rollMode === 'sequential' && throwLocked !== null && throwLocked !== currentPlayerId;
  const isSimultaneous = rollMode === 'simultaneous';

  const isSameSetMode = isSimultaneous && simultaneousSubMode === 'same-set';
  const lockedSetId = isSameSetMode ? simultaneousSetId : null;

  const myChosenSetId = currentPlayerId ? readyPlayerSets[currentPlayerId] : undefined;

  return (
    <div className="space-y-2">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary">
        {t('sets')}
      </h3>

      {sets.length === 0 && (
        <p className="py-4 text-center text-sm text-text-muted">
          {t('noSets')}
        </p>
      )}

      {isSimultaneous && readyCount > 0 && (
        <div className="rounded-md bg-primary/10 px-3 py-1.5 text-center text-xs font-semibold text-primary-light">
          {t('readyCount', { ready: readyCount, total: totalPlayers })}
        </div>
      )}

      <div className="space-y-1.5">
        {sets.map((set) => {
          let buttonLabel = t('roll');
          let buttonDisabled = false;
          let buttonClass = 'shrink-0 rounded-lg border border-amber-700/60 bg-gradient-to-b from-amber-700 to-amber-900 px-3 py-1.5 text-sm font-bold text-amber-100 shadow-md shadow-amber-900/40 transition-all duration-150 hover:from-amber-600 hover:to-amber-800 active:scale-[0.97] glow-amber';

          const handleClick = () => {
            if (isSimultaneous && onReady) {
              onReady(set.id);
            } else {
              onThrow(set.id);
            }
          };

          if (isSequentialLocked) {
            buttonLabel = t('locked');
            buttonDisabled = true;
            buttonClass = 'shrink-0 rounded-lg border border-gray-600/40 bg-gradient-to-b from-gray-600 to-gray-700 px-3 py-1.5 text-sm font-bold text-gray-400 shadow-md cursor-not-allowed opacity-60';
          } else if (isSimultaneous) {
            if (isPlayerReady) {
              if (myChosenSetId === set.id) {
                buttonLabel = t('readyConfirm');
                buttonClass = 'shrink-0 rounded-lg border border-green-600/60 bg-gradient-to-b from-green-700 to-green-900 px-3 py-1.5 text-sm font-bold text-green-100 shadow-md shadow-green-900/40 cursor-default';
              } else {
                buttonLabel = t('locked');
                buttonClass = 'shrink-0 rounded-lg border border-gray-600/40 bg-gradient-to-b from-gray-600 to-gray-700 px-3 py-1.5 text-sm font-bold text-gray-400 shadow-md cursor-not-allowed opacity-60';
              }
              buttonDisabled = true;
            } else if (isSameSetMode && lockedSetId && lockedSetId !== set.id) {
              buttonLabel = t('locked');
              buttonDisabled = true;
              buttonClass = 'shrink-0 rounded-lg border border-gray-600/40 bg-gradient-to-b from-gray-600 to-gray-700 px-3 py-1.5 text-sm font-bold text-gray-400 shadow-md cursor-not-allowed opacity-60';
            } else {
              buttonLabel = t('readyBtn');
              buttonClass = 'shrink-0 rounded-lg border border-green-600/60 bg-gradient-to-b from-green-700 to-green-900 px-3 py-1.5 text-sm font-bold text-green-100 shadow-md shadow-green-900/40 transition-all duration-150 hover:from-green-600 hover:to-green-800 active:scale-[0.97]';
            }
          }

          return (
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
                onClick={handleClick}
                disabled={buttonDisabled}
                className={buttonClass}
              >
                {buttonLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
