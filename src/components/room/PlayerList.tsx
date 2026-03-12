'use client';

import { useTranslations } from 'next-intl';
import type { Player, DiceResult, RollMode } from '@/lib/types';

export interface PlayerListProps {
  players: Player[];
  lastResults: Record<string, DiceResult>;
  currentPlayerId: string;
  readyPlayers?: string[];
  rollMode?: RollMode;
}

function formatLastResult(result: DiceResult): string {
  const grouped: Record<string, { count: number; total: number }> = {};
  for (const r of result.results) {
    if (!grouped[r.type]) {
      grouped[r.type] = { count: 0, total: 0 };
    }
    grouped[r.type].count += 1;
    grouped[r.type].total += r.value;
  }

  const parts = Object.entries(grouped).map(([type, { count, total }]) =>
    count > 1 ? `${count}${type}: ${total}` : `${type}: ${total}`
  );

  return parts.join(' + ');
}

export default function PlayerList({
  players,
  lastResults,
  currentPlayerId,
  readyPlayers = [],
  rollMode = 'free',
}: PlayerListProps) {
  const t = useTranslations('players');
  const tc = useTranslations('common');

  return (
    <div className="space-y-1">
      <h3 className="mb-2 font-heading text-sm font-semibold uppercase tracking-wider text-primary">
        {t('title', { count: players.length })}
      </h3>

      <ul className="space-y-1.5" role="list">
        {players.map((player) => {
          const isMe = player.id === currentPlayerId;
          const lastResult = lastResults[player.id] ?? null;
          const isReady = rollMode === 'simultaneous' && readyPlayers.includes(player.id);

          return (
            <li
              key={player.id}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                isMe
                  ? 'bg-primary/10 ring-1 ring-primary/20'
                  : isReady
                    ? 'bg-green-500/10 ring-1 ring-green-500/20'
                    : 'bg-bg-light/50'
              }`}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
                style={{ backgroundColor: player.color }}
                aria-hidden="true"
              />

              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span
                  className={`truncate text-sm ${
                    player.isHost ? 'font-bold text-primary-light' : 'text-text'
                  }`}
                >
                  {player.isHost && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="mr-1 inline-block h-3.5 w-3.5 text-primary"
                      aria-label="Host"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {player.name}
                </span>

                {isMe && (
                  <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-light">
                    {t('you')}
                  </span>
                )}
                {isReady && (
                  <span className="shrink-0 rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                    {t('ready')}
                  </span>
                )}
              </span>

              {lastResult && (
                <span className="shrink-0 text-xs text-text-muted">
                  {formatLastResult(lastResult)}
                </span>
              )}

              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  player.connected ? 'bg-green-500' : 'bg-gray-500'
                }`}
                title={player.connected ? tc('connected') : tc('disconnected')}
                aria-label={player.connected ? tc('connected') : tc('disconnected')}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
