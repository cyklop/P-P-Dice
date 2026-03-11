'use client';

import { useEffect, useRef } from 'react';
import type { DiceResult, Player } from '@/lib/types';

export interface HistoryLogProps {
  history: DiceResult[];
  players: Player[];
}

/** Format a timestamp into a relative German string like "vor 2 Min". */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return 'gerade eben';
  if (diffSec < 60) return `vor ${diffSec} Sek`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min`;

  const diffHr = Math.floor(diffMin / 60);
  return `vor ${diffHr} Std`;
}

/** Format dice results showing individual values, e.g. "2D6: [4, 3] = 7". */
function formatResultDetail(result: DiceResult): string {
  // Group by dice type
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build a lookup from player id to player
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Auto-scroll to newest entry (top) when history changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [history.length]);

  // Show newest first
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary">
        Würfel-History
      </h3>

      <div
        ref={scrollRef}
        className="max-h-64 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin"
        role="log"
        aria-live="polite"
      >
        {sorted.length === 0 && (
          <p className="py-6 text-center text-sm text-text-muted">
            Noch keine Würfe.
          </p>
        )}

        {sorted.map((entry, idx) => {
          const player = playerMap.get(entry.playerId);
          const playerName = player?.name ?? 'Unbekannt';
          const playerColor = player?.color ?? '#94a3b8';

          return (
            <div
              key={`${entry.playerId}-${entry.timestamp}-${idx}`}
              className="rounded-lg bg-bg-light/50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                {/* Player info */}
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

                {/* Timestamp */}
                <span className="shrink-0 text-[10px] text-text-muted">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </div>

              {/* Result detail */}
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
