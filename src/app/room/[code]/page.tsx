'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DiceScene } from '@/components/3d/DiceScene';
import type { DiceProps } from '@/components/3d/Dice';
import JoinDialog from '@/components/room/JoinDialog';
import Sidebar from '@/components/room/Sidebar';
import HostPanel from '@/components/room/HostPanel';
import { useSocket } from '@/hooks/useSocket';
import type { DiceResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoomPage({ params }: RoomPageProps) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const isCreating = upperCode === 'NEW';

  // Socket connection
  const {
    connected,
    roomState,
    playerId,
    createRoom,
    joinRoom,
    throwDice,
    updateSets,
    lockRoom,
    kickPlayer,
    clearHistory,
    finalizeAnimation,
    activeAnimation,
    playerDice,
    diceHistory,
  } = useSocket();

  // Persist join state across re-renders caused by URL changes
  const hasJoinedRef = useRef(false);
  const roomCodeRef = useRef<string | null>(isCreating ? null : upperCode);
  const [hasJoined, setHasJoined] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(isCreating ? null : upperCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [hostPanelOpen, setHostPanelOpen] = useState(false);

  // Recover from state loss if refs indicate we already joined
  useEffect(() => {
    if (hasJoinedRef.current && !hasJoined) {
      setHasJoined(true);
    }
    if (roomCodeRef.current && !roomCode) {
      setRoomCode(roomCodeRef.current);
    }
  }, [hasJoined, roomCode]);

  // Join or create+join handler
  const handleJoin = useCallback(
    async (name: string, color: string) => {
      setJoinError(null);
      try {
        if (isCreating) {
          const newCode = await createRoom(name, color);
          roomCodeRef.current = newCode;
          setRoomCode(newCode);
          hasJoinedRef.current = true;
          setHasJoined(true);
          window.history.replaceState(window.history.state, '', `/room/${newCode}`);
        } else {
          const ok = await joinRoom(roomCode!, name, color);
          if (ok) {
            hasJoinedRef.current = true;
            setHasJoined(true);
          } else {
            setJoinError('Beitritt fehlgeschlagen. Prüfe den Raum-Code.');
          }
        }
      } catch {
        setJoinError('Verbindungsfehler. Bitte versuche es erneut.');
      }
    },
    [joinRoom, createRoom, roomCode, isCreating],
  );

  // Throw handler: sends throw over socket for a given set
  const handleThrow = useCallback(
    (setId: string) => {
      throwDice(setId);
    },
    [throwDice],
  );

  // Build per-player last result map for sidebar
  const lastResults = useMemo(() => {
    const map: Record<string, DiceResult> = {};
    for (const result of diceHistory) {
      if (!map[result.playerId] || result.timestamp > map[result.playerId].timestamp) {
        map[result.playerId] = result;
      }
    }
    return map;
  }, [diceHistory]);

  // Determine current player info
  const currentPlayer = roomState?.players.find((p) => p.id === playerId);
  const isHost = currentPlayer?.isHost ?? false;
  const takenColors = roomState?.players.map((p) => p.color) ?? [];

  // Build static dice from ALL players' last resting positions.
  // Skip the player whose dice are currently animating.
  const staticDice: DiceProps[] = useMemo(() => {
    const result: DiceProps[] = [];

    for (const [pid, state] of playerDice) {
      // Skip player whose throw is currently animating
      if (activeAnimation && activeAnimation.playerId === pid) continue;
      if (!state.lastFrame) continue;

      // Find the player's color
      const player = roomState?.players.find((p) => p.id === pid);
      const color = player?.color ?? '#c2782e';

      for (const f of state.lastFrame) {
        result.push({
          id: f.diceId,
          type: state.diceTypeMap[f.diceId] ?? 'D6',
          color,
          position: [f.position.x, f.position.y, f.position.z] as [number, number, number],
          rotation: [f.rotation.x, f.rotation.y, f.rotation.z, f.rotation.w] as [number, number, number, number],
          resultValue: state.resultValues?.[f.diceId] ?? null,
        });
      }
    }

    return result;
  }, [playerDice, activeAnimation, roomState?.players]);

  // ---------------------------------------------------------------------------
  // Pre-join: show join dialog
  // ---------------------------------------------------------------------------

  if (!hasJoined) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 gap-6">
        <h1 className="font-heading text-4xl font-bold text-primary-light tracking-wide">
          {isCreating ? 'Neuen Raum erstellen' : `Raum: ${upperCode}`}
        </h1>

        {!connected && (
          <p className="text-text-muted text-sm animate-pulse">
            Verbindung wird hergestellt...
          </p>
        )}

        {joinError && (
          <p className="text-red-400 text-sm">{joinError}</p>
        )}

        <JoinDialog
          takenColors={takenColors}
          onJoin={handleJoin}
          isOpen={connected}
        />

        <Link
          href="/"
          className="mt-4 px-6 py-2 rounded-xl font-heading text-sm tracking-wide
                     border-2 border-surface text-text-muted
                     hover:border-primary hover:text-primary
                     transition-colors duration-200"
        >
          Zurück zur Startseite
        </Link>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Main room view
  // ---------------------------------------------------------------------------

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-bg">
      {/* 3D Scene area */}
      <div className="relative flex-1">
        {/* Room code badge */}
        <div className="absolute left-4 top-4 z-20 rounded-lg border border-border-fantasy/40 bg-bg-card/80 px-3 py-1.5 backdrop-blur-sm">
          <span className="font-mono text-sm font-bold tracking-widest text-primary-light">
            {roomCode ?? upperCode}
          </span>
          <span
            className={`ml-2 inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
            title={connected ? 'Verbunden' : 'Getrennt'}
          />
        </div>

        <DiceScene
          dice={staticDice}
          physicsFrames={activeAnimation?.frames ?? null}
          diceTypeMap={activeAnimation?.diceTypeMap ?? {}}
          diceColor={
            activeAnimation
              ? (roomState?.players.find((p) => p.id === activeAnimation.playerId)?.color ?? '#c2782e')
              : (currentPlayer?.color ?? '#c2782e')
          }
          onAnimationComplete={finalizeAnimation}
        />
      </div>

      {/* Sidebar */}
      {roomState && playerId && (
        <Sidebar
          players={roomState.players}
          currentPlayerId={playerId}
          lastResults={lastResults}
          sets={roomState.sets}
          onThrow={handleThrow}
          history={diceHistory}
        />
      )}

      {/* Host Panel toggle + collapsible panel */}
      {roomState && isHost && (
        <>
          <button
            type="button"
            onClick={() => setHostPanelOpen((o) => !o)}
            className="absolute left-4 top-16 z-20 flex items-center gap-1.5 rounded-lg border border-border-fantasy/40 bg-bg-card/90 px-3 py-1.5 text-xs font-semibold text-primary-light shadow-md backdrop-blur-sm transition-colors hover:bg-bg-card"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 transition-transform ${hostPanelOpen ? 'rotate-90' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Host-Steuerung
          </button>
          {hostPanelOpen && (
            <div className="absolute left-4 top-[5.5rem] bottom-4 z-10 w-96 overflow-y-auto rounded-xl border border-border-fantasy/40 bg-bg-card/95 p-4 shadow-xl backdrop-blur-md">
              <HostPanel
                room={roomState}
                isHost={isHost}
                onLockToggle={lockRoom}
                onKickPlayer={kickPlayer}
                onClearHistory={clearHistory}
                onUpdateSets={updateSets}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
