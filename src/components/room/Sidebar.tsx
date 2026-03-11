'use client';

import { useState } from 'react';
import type { Player, DiceResult, DiceSet } from '@/lib/types';
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
  history: DiceResult[];
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
  history,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('history');

  const sidebarContent = (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 pt-14">
      {/* Player List */}
      <section>
        <PlayerList
          players={players}
          lastResults={lastResults}
          currentPlayerId={currentPlayerId}
        />
      </section>

      {/* Divider */}
      <hr className="border-border-fantasy/30" />

      {/* Dice Set Selector */}
      <section>
        <DiceSetSelector
          sets={sets}
          onThrow={onThrow}
        />
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
