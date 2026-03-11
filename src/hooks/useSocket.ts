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
  Room,
  ServerToClientEvents,
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
  joinRoom: (code: string, name: string, color: string) => Promise<boolean>;
  throwDice: (setId: string) => void;
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
  } | null;
  /** Per-player resting dice (final positions from their last throw). */
  playerDice: Map<string, PlayerDiceState>;
  lastResult: DiceResult | null;
  diceHistory: DiceResult[];
}

// ---------------------------------------------------------------------------
// Storage helpers for reconnect token
// ---------------------------------------------------------------------------

const RECONNECT_KEY = 'pp_dice_reconnect';

function storeReconnectToken(code: string, playerId: string) {
  try {
    sessionStorage.setItem(RECONNECT_KEY, JSON.stringify({ code, playerId }));
  } catch {
    // storage unavailable
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getReconnectToken(): { code: string; playerId: string } | null {
  try {
    const raw = sessionStorage.getItem(RECONNECT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clearReconnectToken() {
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
  } | null>(null);
  const [playerDice, setPlayerDice] = useState<Map<string, PlayerDiceState>>(new Map());
  const [lastResult, setLastResult] = useState<DiceResult | null>(null);
  const [diceHistory, setDiceHistory] = useState<DiceResult[]>([]);

  // -----------------------------------------------------------------------
  // Connect on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const socket: TypedSocket = io({
      // Same origin -- the Next.js custom server also serves Socket.io
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
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

      // Clear animation for this player
      setActiveAnimation((prev) =>
        prev?.playerId === result.playerId ? null : prev,
      );
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
      socket.emit('room:create', { name, color }, (code: string) => {
        // The creator is automatically a player in the room
        if (socket.id) {
          setPlayerId(socket.id);
          storeReconnectToken(code, socket.id);
        }
        resolve(code);
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        socket.emit('room:join', { code, name, color }, (success: boolean, error?: string) => {
          if (success && socket.id) {
            setPlayerId(socket.id);
            storeReconnectToken(code, socket.id);
          }
          resolve(success);
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
          const existing = next.get(prev.playerId);
          if (existing) {
            next.set(prev.playerId, { ...existing, lastFrame, animFrames: null });
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
    joinRoom,
    throwDice,
    updateSets,
    lockRoom,
    kickPlayer,
    clearHistory,
    finalizeAnimation,
    activeAnimation,
    playerDice,
    lastResult,
    diceHistory,
  };
}
