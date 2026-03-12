'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { DiceResult, Player } from '@/lib/types';

export interface HistoryLogProps {
  history: DiceResult[];
  players: Player[];
}

function useRelativeTimeFormatter() {
  const t = useTranslations('history');

  return (timestamp: number): string => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 10) return t('justNow');
    if (diffSec < 60) return t('secondsAgo', { seconds: diffSec });

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t('minutesAgo', { minutes: diffMin });

    const diffHr = Math.floor(diffMin / 60);
    return t('hoursAgo', { hours: diffHr });
  };
}

function formatResultDetail(result: DiceResult): string {
  const grouped: Record<string, number[]> = {};
  for (const r of result.results) {
    if (!grouped[r.type]) {
      grouped[r.type] = [];
    }
    grouped[r.type].push(r.value);
  }

  const parts = Object.entries(grouped).map(([type, values]) => {
    const total = values.reduce((a, b) => a + b, 0);
    if (values.length === 1) {
      return `${type}: ${values[0]}`;
    }
    return `${values.length}${type}: [${values.join(', ')}] = ${total}`;
  });

  return parts.join('  |  ');
}

export default function HistoryLog({ history, players }: HistoryLogProps) {
  const t = useTranslations('history');
  const scrollRef = useRef<HTMLDivElement>(null);
  const formatRelativeTime = useRelativeTimeFormatter();

  const playerMap = new Map(players.map((p) => [p.id, p]));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [history.length]);

  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary">
        {t('title')}
      </h3>

      <div
        ref={scrollRef}
        className="space-y-1.5 overflow-y-auto pr-1 scrollbar-thin"
        role="log"
        aria-live="polite"
      >
        {sorted.length === 0 && (
          <p className="py-6 text-center text-sm text-text-muted">
            {t('empty')}
          </p>
        )}

        {sorted.map((entry, idx) => {
          const player = playerMap.get(entry.playerId);
          const playerName = player?.name ?? t('unknown');
          const playerColor = player?.color ?? '#94a3b8';

          return (
            <div
              key={`${entry.playerId}-${entry.timestamp}-${idx}`}
              className="rounded-lg bg-bg-light/50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: playerColor }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-xs font-medium text-text">
                    {playerName}
                  </span>
                </div>

                <span className="shrink-0 text-[10px] text-text-muted">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>

              <p className="mt-1 text-xs text-text-muted">
                {formatResultDetail(entry)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
