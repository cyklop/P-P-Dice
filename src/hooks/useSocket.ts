'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  DiceResult,
  DiceSet,
  DiceType,
  PhysicsFrame,
  Player,
  PlayerRestingDice,
  RollMode,
  Room,
  ServerToClientEvents,
  SimultaneousSubMode,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Per-player dice state after a throw completes or during animation. */
export interface PlayerDiceState {
  diceTypeMap: Record<string, DiceType>;
  /** Final frame positions (set after animation completes). */
  lastFrame: PhysicsFrame[] | null;
  /** Cached animation frames so we can extract the last frame on animation end. */
  animFrames: PhysicsFrame[][] | null;
  /** Maps diceId → result value (set when dice:result arrives). */
  resultValues: Record<string, number>;
}

export interface UseSocketReturn {
  socket: TypedSocket | null;
  connected: boolean;
  roomState: Room | null;
  /** ID of the current player (assigned after joining). */
  playerId: string | null;
  createRoom: (name: string, color: string) => Promise<string>;
  fetchRoomInfo: (code: string) => Promise<{ exists: boolean; takenColors: string[]; playerNames: string[] } | null>;
  joinRoom: (code: string, name: string, color: string) => Promise<boolean>;
  throwDice: (setId: string) => void;
  readyDice: (setId: string) => void;
  forceThrow: () => void;
  changeRollMode: (rollMode: RollMode, simultaneousSubMode?: SimultaneousSubMode) => void;
  updateSets: (sets: DiceSet[]) => void;
  lockRoom: () => void;
  kickPlayer: (playerId: string) => void;
  clearHistory: () => void;
  /** Call when client-side animation ends to persist final positions. */
  finalizeAnimation: () => void;
  /** Physics frames for the currently animating throw (null when idle). */
  activeAnimation: {
    playerId: string;
    frames: PhysicsFrame[][];
    diceTypeMap: Record<string, DiceType>;
    /** Maps diceId -> playerId (for simultaneous mode coloring). */
    dicePlayerMap?: Record<string, string>;
  } | null;
  /** Per-player resting dice (final positions from their last throw). */
  playerDice: Map<string, PlayerDiceState>;
  lastResult: DiceResult | null;
  diceHistory: DiceResult[];
  /** Player ID currently throwing (sequential mode lock). */
  throwLocked: string | null;
  /** Player IDs who are ready (simultaneous mode). */
  readyPlayers: string[];
  /** Per-player set choices (simultaneous mode). */
  readyPlayerSets: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Storage helpers for reconnect token
// ---------------------------------------------------------------------------

const RECONNECT_KEY = 'pp_dice_reconnect';

function storeReconnectData(code: string, reconnectToken: string) {
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ code, reconnectToken }));
  } catch {
    // storage unavailable
  }
}

function getReconnectData(): { code: string; reconnectToken: string } | null {
  try {
    const raw = sessionStorage.getItem(RECONNECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.reconnectToken) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearReconnectData() {
  try {
    sessionStorage.removeItem(RECONNECT_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [activeAnimation, setActiveAnimation] = useState<{
    playerId: string;
    frames: PhysicsFrame[][];
    diceTypeMap: Record<string, DiceType>;
    dicePlayerMap?: Record<string, string>;
  } | null>(null);
  const [playerDice, setPlayerDice] = useState<Map<string, PlayerDiceState>>(new Map());
  const [lastResult, setLastResult] = useState<DiceResult | null>(null);
  const [diceHistory, setDiceHistory] = useState<DiceResult[]>([]);
  const [throwLocked, setThrowLocked] = useState<string | null>(null);
  const [readyPlayers, setReadyPlayers] = useState<string[]>([]);
  const [readyPlayerSets, setReadyPlayerSets] = useState<Record<string, string>>({});

  // -----------------------------------------------------------------------
  // Connect on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const savedData = getReconnectData();

    const socket: TypedSocket = io({
      // Same origin -- the Next.js custom server also serves Socket.io
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: savedData ? { reconnectToken: savedData.reconnectToken } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // -- Room state (full sync) -----------------------------------------
    socket.on('room:state', (room: Room) => {
      setRoomState(room);
      // If we receive room:state and playerId isn't set yet, this is a reconnect
      if (socket.id) {
        setPlayerId(socket.id);
      }
    });

    // -- Player events --------------------------------------------------
    socket.on('player:joined', (player: Player) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        const exists = prev.players.some((p) => p.id === player.id);
        if (exists) {
          return {
            ...prev,
            players: prev.players.map((p) => (p.id === player.id ? player : p)),
          };
        }
        return { ...prev, players: [...prev.players, player] };
      });
    });

    socket.on('player:left', (leftPlayerId: string) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === leftPlayerId ? { ...p, connected: false } : p,
          ),
        };
      });
    });

    // -- Physics frames (all at once) ------------------------------------
    socket.on('dice:physics', (data) => {
      const typeMap: Record<string, DiceType> = {};
      for (const dt of data.diceTypes) {
        typeMap[dt.id] = dt.type;
      }

      // Store the animation for this player
      setActiveAnimation({
        playerId: data.playerId,
        frames: data.allFrames,
        diceTypeMap: typeMap,
      });

      // Update per-player dice state — keep old lastFrame so static dice
      // remain visible until the new animation replaces them.
      setPlayerDice((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.playerId);
        next.set(data.playerId, {
          diceTypeMap: typeMap,
          lastFrame: existing?.lastFrame ?? null, // keep old positions
          animFrames: data.allFrames, // cache for extracting final frame later
          resultValues: {}, // cleared until dice:result arrives
        });
        return next;
      });
    });

    // -- Dice result (final) -------------------------------------------
    socket.on('dice:result', (result: DiceResult) => {
      setLastResult(result);
      setDiceHistory((prev) => [...prev, result]);

      // Finalize per-player dice: store final positions from cached animFrames
      // and build resultValues map (diceId → value) for visual highlights
      setPlayerDice((pd) => {
        const next = new Map(pd);
        const existing = next.get(result.playerId);
        if (existing) {
          const lastFrame = existing.animFrames?.length
            ? existing.animFrames[existing.animFrames.length - 1]
            : existing.lastFrame;

          // Map dice IDs (from diceTypeMap order) to result values
          const diceIds = Object.keys(existing.diceTypeMap);
          const resultValues: Record<string, number> = {};
          for (let i = 0; i < Math.min(diceIds.length, result.results.length); i++) {
            resultValues[diceIds[i]] = result.results[i].value;
          }

          next.set(result.playerId, { ...existing, lastFrame, animFrames: null, resultValues });
        }
        return next;
      });

      // Clear animation for this player (but not group animations —
      // those are cleared by finalizeAnimation when playback completes)
      setActiveAnimation((prev) => {
        if (!prev) return null;
        if (prev.dicePlayerMap) return prev; // group animation — don't clear here
        return prev.playerId === result.playerId ? null : prev;
      });
    });

    // -- Sets changed ---------------------------------------------------
    socket.on('sets:changed', (sets: DiceSet[]) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return { ...prev, sets };
      });
    });

    // -- Room locked/unlocked --------------------------------------------
    socket.on('room:locked', (isLocked: boolean) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return { ...prev, isLocked };
      });
    });

    // -- Existing dice (sent on join or history:clear) -------------------
    socket.on('dice:existing', (data: PlayerRestingDice[]) => {
      setPlayerDice(() => {
        const next = new Map<string, PlayerDiceState>();
        for (const pd of data) {
          const typeMap: Record<string, DiceType> = {};
          for (const dt of pd.diceTypes) {
            typeMap[dt.id] = dt.type;
          }
          next.set(pd.playerId, {
            diceTypeMap: typeMap,
            lastFrame: pd.finalFrame,
            animFrames: null,
            resultValues: pd.resultValues,
          });
        }
        return next;
      });
      // If empty data, also clear history (it's a clear command)
      if (data.length === 0) {
        setDiceHistory([]);
        setLastResult(null);
      }
    });

    // -- Roll mode events ------------------------------------------------
    socket.on('roll-mode:changed', (data) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return { ...prev, rollMode: data.rollMode, simultaneousSubMode: data.simultaneousSubMode };
      });
      setThrowLocked(null);
      setReadyPlayers([]);
      setReadyPlayerSets({});
    });

    socket.on('throw:locked', (lockedPlayerId: string | null) => {
      setThrowLocked(lockedPlayerId);
    });

    socket.on('ready:update', (data) => {
      setReadyPlayers(data.readyPlayers);
      setReadyPlayerSets(data.readyPlayerSets ?? {});
      setRoomState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          readyPlayers: data.readyPlayers,
          readyPlayerSets: data.readyPlayerSets ?? {},
          simultaneousSetId: data.simultaneousSetId,
        };
      });
    });

    // -- Group physics (simultaneous mode) --------------------------------
    socket.on('dice:group-physics', (data) => {
      // Build combined type map and player map from all players
      const typeMap: Record<string, DiceType> = {};
      const playerMap: Record<string, string> = {};
      for (const p of data.players) {
        for (const dt of p.diceTypes) {
          typeMap[dt.id] = dt.type;
          playerMap[dt.id] = p.playerId;
        }
      }

      // For each player, store their dice type maps for later result matching
      setPlayerDice((prev) => {
        const next = new Map(prev);
        for (const p of data.players) {
          const playerTypeMap: Record<string, DiceType> = {};
          for (const dt of p.diceTypes) {
            playerTypeMap[dt.id] = dt.type;
          }
          const existing = next.get(p.playerId);
          next.set(p.playerId, {
            diceTypeMap: playerTypeMap,
            lastFrame: existing?.lastFrame ?? null,
            animFrames: data.allFrames,
            resultValues: {},
          });
        }
        return next;
      });

      // Use the first player's ID as the "active animation" but include all dice
      if (data.players.length > 0) {
        setActiveAnimation({
          playerId: data.players[0].playerId,
          frames: data.allFrames,
          diceTypeMap: typeMap,
          dicePlayerMap: playerMap,
        });
      }
    });

    // -- Host changed ---------------------------------------------------
    socket.on('host:changed', (newHostId: string) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hostId: newHostId,
          players: prev.players.map((p) => ({
            ...p,
            isHost: p.id === newHostId,
          })),
        };
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const createRoom = useCallback((name: string, color: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error('Not connected'));
        return;
      }
      socket.emit('room:create', { name, color }, (data) => {
        // The creator is automatically a player in the room
        if (socket.id) {
          setPlayerId(socket.id);
          storeReconnectData(data.code, data.reconnectToken);
        }
        resolve(data.code);
      });
    });
  }, []);

  const fetchRoomInfo = useCallback((code: string): Promise<{ exists: boolean; takenColors: string[]; playerNames: string[] } | null> => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error('Not connected'));
        return;
      }
      socket.emit('room:info', { code }, (info) => {
        resolve(info);
      });
    });
  }, []);

  const joinRoom = useCallback(
    (code: string, name: string, color: string): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket) {
          reject(new Error('Not connected'));
          return;
        }
        socket.emit('room:join', { code, name, color }, (data) => {
          if (data.success && socket.id && data.reconnectToken) {
            setPlayerId(socket.id);
            storeReconnectData(code, data.reconnectToken);
          }
          resolve(data.success);
        });
      });
    },
    [],
  );

  const throwDice = useCallback((setId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('dice:throw', { setId });
  }, []);

  const readyDice = useCallback((setId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('dice:ready', { setId });
  }, []);

  const forceThrow = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('dice:force-throw');
  }, []);

  const changeRollMode = useCallback((rollMode: RollMode, simultaneousSubMode?: SimultaneousSubMode) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('roll-mode:change', { rollMode, simultaneousSubMode });
  }, []);

  const updateSets = useCallback((sets: DiceSet[]) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('sets:update', sets);
  }, []);

  const lockRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('room:lock');
  }, []);

  const kickPlayer = useCallback((targetPlayerId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('room:kick', targetPlayerId);
  }, []);

  const clearHistory = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('history:clear');
  }, []);

  /** Called when the client-side animation finishes — immediately stores
   *  final dice positions so there's no gap between animation and static. */
  const finalizeAnimation = useCallback(() => {
    setActiveAnimation((prev) => {
      if (prev && prev.frames.length > 0) {
        const lastFrame = prev.frames[prev.frames.length - 1];
        setPlayerDice((pd) => {
          const next = new Map(pd);

          if (prev.dicePlayerMap) {
            // Group animation: finalize ALL participating players
            const playerIds = new Set(Object.values(prev.dicePlayerMap));
            for (const pid of playerIds) {
              const existing = next.get(pid);
              if (existing) {
                // Filter lastFrame to only this player's dice
                const playerDiceIds = new Set(
                  Object.entries(prev.dicePlayerMap)
                    .filter(([, p]) => p === pid)
                    .map(([diceId]) => diceId)
                );
                const playerLastFrame = lastFrame.filter(f => playerDiceIds.has(f.diceId));
                next.set(pid, { ...existing, lastFrame: playerLastFrame, animFrames: null });
              }
            }
          } else {
            // Single player animation
            const existing = next.get(prev.playerId);
            if (existing) {
              next.set(prev.playerId, { ...existing, lastFrame, animFrames: null });
            }
          }

          return next;
        });
      }
      return null; // Clear animation
    });
  }, []);

  return {
    socket: socketRef.current,
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
    lastResult,
    diceHistory,
    throwLocked,
    readyPlayers,
    readyPlayerSets,
  };
}
