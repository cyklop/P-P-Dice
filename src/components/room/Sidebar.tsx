'use client';

import { useState } from 'react';
import type { Player, DiceResult, DiceSet, RollMode, SimultaneousSubMode } from '@/lib/types';
import PlayerList from '@/components/room/PlayerList';
import DiceSetSelector from '@/components/room/DiceSetSelector';
import HistoryLog from '@/components/room/HistoryLog';
import StatsPanel from '@/components/room/StatsPanel';

export interface SidebarProps {
  players: Player[];
  currentPlayerId: string;
  lastResults: Record<string, DiceResult>;
  sets: DiceSet[];
  onThrow: (setId: string) => void;
  onReady: (setId: string) => void;
  onForceThrow: () => void;
  history: DiceResult[];
  rollMode: RollMode;
  simultaneousSubMode: SimultaneousSubMode;
  isHost: boolean;
  onRollModeChange: (mode: RollMode, subMode?: SimultaneousSubMode) => void;
  throwLocked: string | null;
  readyPlayers: string[];
  readyPlayerSets: Record<string, string>;
  simultaneousSetId: string | null;
}

type TabId = 'history' | 'stats';

/** Hamburger / close icon for the mobile toggle. */
function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-5 w-5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

export default function Sidebar({
  players,
  currentPlayerId,
  lastResults,
  sets,
  onThrow,
  onReady,
  onForceThrow,
  history,
  rollMode,
  simultaneousSubMode,
  isHost,
  onRollModeChange,
  throwLocked,
  readyPlayers,
  readyPlayerSets,
  simultaneousSetId,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('history');

  const connectedCount = players.filter(p => p.connected).length;
  const readyCount = readyPlayers.length;
  const isPlayerReady = readyPlayers.includes(currentPlayerId);

  const sidebarContent = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 pt-14">
      {/* Roll Mode Toggle */}
      <section>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-bg-light/40 p-0.5" role="radiogroup" aria-label="Wurf-Modus">
            {(['free', 'sequential', 'simultaneous'] as RollMode[]).map((mode) => {
              const labels: Record<RollMode, string> = {
                free: 'Frei',
                sequential: 'Einzeln',
                simultaneous: 'Gemeinsam',
              };
              const isActive = rollMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={!isHost}
                  onClick={() => onRollModeChange(mode)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? 'bg-primary/25 text-primary-light shadow-sm'
                      : isHost
                        ? 'text-text-muted hover:text-text hover:bg-bg-light/60'
                        : 'text-text-muted/50 cursor-default'
                  }`}
                >
                  {labels[mode]}
                </button>
              );
            })}
          </div>
        </div>
        {rollMode === 'simultaneous' && isHost && (
          <div className="mt-1.5 flex rounded-md bg-bg-light/30 p-0.5">
            {(['same-set', 'individual'] as SimultaneousSubMode[]).map((sub) => {
              const labels: Record<SimultaneousSubMode, string> = { 'same-set': 'Gleiches Set', individual: 'Individuell' };
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => onRollModeChange('simultaneous', sub)}
                  className={`flex-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    simultaneousSubMode === sub
                      ? 'bg-primary/15 text-primary-light'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {labels[sub]}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Divider */}
      <hr className="border-border-fantasy/30" />

      {/* Player List */}
      <section>
        <PlayerList
          players={players}
          lastResults={lastResults}
          currentPlayerId={currentPlayerId}
          readyPlayers={readyPlayers}
          rollMode={rollMode}
        />
      </section>

      {/* Divider */}
      <hr className="border-border-fantasy/30" />

      {/* Dice Set Selector */}
      <section>
        <DiceSetSelector
          sets={sets}
          onThrow={onThrow}
          onReady={onReady}
          rollMode={rollMode}
          simultaneousSubMode={simultaneousSubMode}
          throwLocked={throwLocked}
          currentPlayerId={currentPlayerId}
          isPlayerReady={isPlayerReady}
          readyCount={readyCount}
          totalPlayers={connectedCount}
          simultaneousSetId={simultaneousSetId}
          readyPlayerSets={readyPlayerSets}
        />
        {/* Host force-throw button */}
        {rollMode === 'simultaneous' && isHost && readyCount > 0 && readyCount < connectedCount && (
          <button
            type="button"
            onClick={onForceThrow}
            className="mt-2 w-full rounded-lg border border-amber-600/40 bg-amber-900/30 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-900/50"
          >
            Trotzdem würfeln ({readyCount}/{connectedCount} bereit)
          </button>
        )}
      </section>

      {/* Divider */}
      <hr className="border-border-fantasy/30" />

      {/* Tabs: History / Stats */}
      <section className="flex flex-1 flex-col min-h-0">
        <div className="mb-2 flex rounded-lg bg-bg-light/40 p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-primary/20 text-primary-light'
                : 'text-text-muted hover:text-text'
            }`}
          >
            History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stats'}
            onClick={() => setActiveTab('stats')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'stats'
                ? 'bg-primary/20 text-primary-light'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Statistiken
          </button>
        </div>

        <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'history' ? (
            <HistoryLog history={history} players={players} />
          ) : (
            <StatsPanel history={history} players={players} />
          )}
        </div>
      </section>
    </div>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        type="button"
        onClick={() => setMobileOpen((prev) => !prev)}
        className="fixed right-4 top-4 z-50 rounded-lg border border-border-fantasy bg-bg-card p-2 text-primary shadow-lg md:hidden"
        aria-label={mobileOpen ? 'Seitenleiste schließen' : 'Seitenleiste öffnen'}
      >
        <MenuIcon open={mobileOpen} />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fantasy-border fixed right-0 top-0 z-40 h-full w-80 bg-bg-card/95 backdrop-blur-md transition-transform duration-300
          md:relative md:translate-x-0 md:bg-bg-card
          ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-label="Seitenleiste"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
