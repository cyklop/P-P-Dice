'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { DiceScene } from '@/components/3d/DiceScene';
import type { DiceProps } from '@/components/3d/Dice';
import JoinDialog from '@/components/room/JoinDialog';
import Sidebar from '@/components/room/Sidebar';
import HostPanel from '@/components/room/HostPanel';
import { useSocket } from '@/hooks/useSocket';
import type { DiceResult } from '@/lib/types';
import { useLocale } from 'next-intl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoomPageProps {
  params: Promise<{ code: string; locale: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoomPage({ params }: RoomPageProps) {
  const { code } = use(params);
  const upperCode = code.toUpperCase();
  const isCreating = upperCode === 'NEW';
  const t = useTranslations('room');
  const tc = useTranslations('common');
  const locale = useLocale();

  // Socket connection
  const {
    connected,
    roomState,
    playerId,
    createRoom,
    fetchRoomInfo,
    joinRoom,
    throwDice,
    readyDice,
    forceThrow,
    changeRollMode,
    updateSets,
    lockRoom,
    kickPlayer,
    clearHistory,
    finalizeAnimation,
    activeAnimation,
    playerDice,
    diceHistory,
    throwLocked,
    readyPlayers,
    readyPlayerSets,
  } = useSocket();

  // Persist join state across re-renders caused by URL changes
  const hasJoinedRef = useRef(false);
  const roomCodeRef = useRef<string | null>(isCreating ? null : upperCode);
  const [hasJoined, setHasJoined] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(isCreating ? null : upperCode);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [hostPanelOpen, setHostPanelOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [roomInfo, setRoomInfo] = useState<{ takenColors: string[]; playerNames: string[] } | null>(null);

  // Auto-reconnect: if roomState arrives via reconnect token, skip join dialog
  useEffect(() => {
    if (roomState && playerId && !hasJoined) {
      hasJoinedRef.current = true;
      setHasJoined(true);
      if (roomState.code) {
        roomCodeRef.current = roomState.code;
        setRoomCode(roomState.code);
        if (roomState.code !== upperCode) {
          window.history.replaceState(window.history.state, '', `/${locale}/room/${roomState.code}`);
        }
      }
    }
  }, [roomState, playerId, hasJoined, upperCode, locale]);

  // Poll room info (taken colors, player names) while join dialog is open
  useEffect(() => {
    if (isCreating || !connected || hasJoined) return;

    const poll = () => {
      fetchRoomInfo(upperCode).then((info) => {
        if (info) {
          setRoomInfo({ takenColors: info.takenColors, playerNames: info.playerNames });
        }
      }).catch(() => { /* ignore */ });
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [isCreating, connected, hasJoined, upperCode, fetchRoomInfo]);

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
          window.history.replaceState(window.history.state, '', `/${locale}/room/${newCode}`);
        } else {
          const ok = await joinRoom(roomCode!, name, color);
          if (ok) {
            hasJoinedRef.current = true;
            setHasJoined(true);
          } else {
            setJoinError(t('joinFailed'));
          }
        }
      } catch {
        setJoinError(t('connectionError'));
      }
    },
    [joinRoom, createRoom, roomCode, isCreating, t, locale],
  );

  // Throw handler
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
  const takenColors = roomInfo?.takenColors ?? roomState?.players.map((p) => p.color) ?? [];
  const existingNames = roomInfo?.playerNames ?? roomState?.players.map((p) => p.name) ?? [];

  // Build static dice from ALL players' last resting positions.
  const staticDice: DiceProps[] = useMemo(() => {
    const result: DiceProps[] = [];

    const animatingPlayerIds = new Set<string>();
    if (activeAnimation) {
      if (activeAnimation.dicePlayerMap) {
        for (const pid of Object.values(activeAnimation.dicePlayerMap)) {
          animatingPlayerIds.add(pid);
        }
      } else {
        animatingPlayerIds.add(activeAnimation.playerId);
      }
    }

    for (const [pid, state] of playerDice) {
      if (animatingPlayerIds.has(pid)) continue;
      if (!state.lastFrame) continue;

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
          {isCreating ? t('createTitle') : t('roomTitle', { code: upperCode })}
        </h1>

        {!connected && (
          <p className="text-text-muted text-sm animate-pulse">
            {tc('connecting')}
          </p>
        )}

        {joinError && (
          <p className="text-red-400 text-sm">{joinError}</p>
        )}

        <JoinDialog
          takenColors={takenColors}
          existingNames={existingNames}
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
          {tc('backToHome')}
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
        {/* Room code badge (click to copy link) */}
        <button
          type="button"
          onClick={() => {
            const url = `${window.location.origin}/${locale}/room/${roomCode ?? upperCode}`;
            navigator.clipboard.writeText(url).then(() => {
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 2000);
            });
          }}
          className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-lg border border-border-fantasy/40 bg-bg-card/80 px-3 py-1.5 backdrop-blur-sm transition-colors hover:bg-bg-card cursor-pointer"
          title={t('copyLink')}
        >
          <span className="font-mono text-sm font-bold tracking-widest text-primary-light">
            {codeCopied ? tc('copied') : (roomCode ?? upperCode)}
          </span>
          {!codeCopied && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-text-muted">
              <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
              <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
            </svg>
          )}
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
            title={connected ? tc('connected') : tc('disconnected')}
          />
        </button>

        <DiceScene
          dice={staticDice}
          physicsFrames={activeAnimation?.frames ?? null}
          diceTypeMap={activeAnimation?.diceTypeMap ?? {}}
          diceColor={
            activeAnimation
              ? (roomState?.players.find((p) => p.id === activeAnimation.playerId)?.color ?? '#c2782e')
              : (currentPlayer?.color ?? '#c2782e')
          }
          diceColorMap={
            activeAnimation?.dicePlayerMap
              ? Object.fromEntries(
                  Object.entries(activeAnimation.dicePlayerMap).map(([diceId, pid]) => [
                    diceId,
                    roomState?.players.find((p) => p.id === pid)?.color ?? '#c2782e',
                  ])
                )
              : undefined
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
          onReady={readyDice}
          onForceThrow={forceThrow}
          history={diceHistory}
          rollMode={roomState.rollMode}
          simultaneousSubMode={roomState.simultaneousSubMode}
          isHost={isHost}
          onRollModeChange={changeRollMode}
          throwLocked={throwLocked}
          readyPlayers={readyPlayers}
          readyPlayerSets={readyPlayerSets}
          simultaneousSetId={roomState.simultaneousSetId}
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
            {t('hostControls')}
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
