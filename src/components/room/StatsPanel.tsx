'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DiceResult, DiceType, Player } from '@/lib/types';
import { DICE_SIDES } from '@/lib/constants';

export interface StatsPanelProps {
  history: DiceResult[];
  players: Player[];
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform duration-200 ${
        open ? 'rotate-180' : ''
      }`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DistributionChart({
  type,
  values,
  distributionLabel,
  throwCountLabel,
}: {
  type: string;
  values: number[];
  distributionLabel: string;
  throwCountLabel: string;
}) {
  const sides = DICE_SIDES[type] ?? 0;
  if (sides === 0 || values.length === 0) return null;

  const isD10X = type === 'D10X';
  const possibleValues = isD10X
    ? [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
    : Array.from({ length: sides }, (_, i) => i + 1);

  const freq = new Map<number, number>();
  for (const v of possibleValues) freq.set(v, 0);
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }

  const maxCount = Math.max(1, ...freq.values());
  const barCount = possibleValues.length;
  const labelInterval = barCount <= 8 ? 1 : barCount <= 12 ? 2 : barCount <= 20 ? 5 : 10;
  const barAreaHeight = Math.min(80, Math.max(40, barCount * 3));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {distributionLabel}
        </span>
        <span className="text-[10px] text-text-muted">{throwCountLabel}</span>
      </div>
      <div
        className="flex items-end gap-[2px]"
        style={{ height: `${barAreaHeight + 14}px` }}
        aria-label={distributionLabel}
      >
        {possibleValues.map((val, i) => {
          const count = freq.get(val) ?? 0;
          const pct = count / maxCount;
          const label = isD10X ? String(val).padStart(2, '0') : String(val);
          const showLabel = (i + 1) % labelInterval === 0 || i === 0;

          return (
            <div key={val} className="group relative flex flex-1 flex-col items-center justify-end" style={{ height: `${barAreaHeight + 14}px` }}>
              {count > 0 && (
                <div className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg-card px-1.5 py-0.5 text-[9px] font-semibold text-text shadow-md border border-border-fantasy/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {label}: {count}x ({((count / values.length) * 100).toFixed(0)}%)
                </div>
              )}
              {count > 0 && (
                <span className="mb-0.5 text-[8px] font-medium leading-none text-primary-light opacity-0 group-hover:opacity-100 transition-opacity">
                  {count}
                </span>
              )}
              <div
                className={`w-full rounded-t-sm transition-all ${count > 0 ? 'bg-primary/60 group-hover:bg-primary' : 'bg-primary/15'}`}
                style={{
                  height: count > 0 ? `${Math.max(3, pct * (barAreaHeight - 14))}px` : '2px',
                }}
              />
              {showLabel && (
                <span className="mt-0.5 text-[8px] leading-none text-text-muted">
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPanel({ history, players }: StatsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const t = useTranslations('stats');
  const th = useTranslations('history');

  const playerMap = new Map(players.map((p) => [p.id, p]));

  const totalThrows = history.length;

  const perPlayer: Record<string, number> = {};
  for (const entry of history) {
    perPlayer[entry.playerId] = (perPlayer[entry.playerId] ?? 0) + 1;
  }

  const diceValues: Record<string, number[]> = {};
  for (const entry of history) {
    for (const r of entry.results) {
      if (!diceValues[r.type]) {
        diceValues[r.type] = [];
      }
      diceValues[r.type].push(r.value);
    }
  }

  const averages: Record<string, string> = {};
  for (const [type, values] of Object.entries(diceValues)) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    averages[type] = avg.toFixed(1);
  }

  const typeOrder: DiceType[] = ['D4', 'D6', 'D8', 'D10', 'D10X', 'D12', 'D20'];
  const sortedTypes = Object.keys(diceValues).sort(
    (a, b) => typeOrder.indexOf(a as DiceType) - typeOrder.indexOf(b as DiceType),
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg bg-bg-light/50 px-3 py-2 text-left transition-colors hover:bg-bg-light"
        aria-expanded={isOpen}
      >
        <h3 className="font-heading text-sm font-semibold uppercase tracking-wider text-primary">
          {t('title')}
        </h3>
        <ChevronIcon open={isOpen} />
      </button>

      {isOpen && (
        <div className="mt-2 space-y-4 rounded-lg bg-bg-light/30 px-3 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{t('totalThrows')}</span>
            <span className="text-sm font-semibold text-text">
              {totalThrows}
            </span>
          </div>

          {Object.entries(perPlayer).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-muted">
                {t('throwsPerPlayer')}
              </p>
              <div className="space-y-1">
                {Object.entries(perPlayer).map(([playerId, count]) => {
                  const player = playerMap.get(playerId);
                  return (
                    <div
                      key={playerId}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: player?.color ?? '#94a3b8',
                          }}
                          aria-hidden="true"
                        />
                        <span className="text-xs text-text">
                          {player?.name ?? th('unknown')}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-text-muted">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(averages).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-text-muted">
                {t('averagePerType')}
              </p>
              <div className="flex flex-wrap gap-2">
                {sortedTypes.map((type) => (
                  <span
                    key={type}
                    className="rounded-md bg-surface px-2 py-1 text-xs text-text"
                  >
                    {type}: {averages[type]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sortedTypes.length > 0 && (
            <div className="space-y-3">
              {sortedTypes.map((type) => (
                <DistributionChart
                  key={type}
                  type={type}
                  values={diceValues[type]}
                  distributionLabel={t('distribution', { type })}
                  throwCountLabel={t('throwCount', { count: diceValues[type].length })}
                />
              ))}
            </div>
          )}

          {totalThrows === 0 && (
            <p className="py-2 text-center text-xs text-text-muted">
              {t('noData')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
