import { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DiceResult,
  DiceType,
  PhysicsFrame,
} from '@/lib/types';
import { DICE_SIDES } from '@/lib/constants';
import { RoomManager, roomManager as defaultRoomManager } from './room-manager';
import { throwDice, type ExistingDie } from './physics';

// ── Types ───────────────────────────────────────────────────────────────────

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

interface SocketMapping {
  roomCode: string;
  playerId: string;
}

// ── Dice rolling helper ─────────────────────────────────────────────────────

function rollDie(type: DiceType): number {
  const sides = DICE_SIDES[type];
  return Math.floor(Math.random() * sides) + 1;
}

// ── Shared throw helpers ─────────────────────────────────────────────────────

/** Expand a dice set into individual { type, id } entries. */
function expandDiceSet(
  playerId: string,
  setId: string,
  dice: { type: DiceType; count: number }[],
): { type: DiceType; id: string }[] {
  const result: { type: DiceType; id: string }[] = [];
  let dieIndex = 0;
  for (const die of dice) {
    for (let i = 0; i < die.count; i++) {
      result.push({
        type: die.type,
        id: `${playerId}-${setId}-${die.type}-${dieIndex++}`,
      });
    }
  }
  return result;
}

/** Build a DiceResult from physics simulation output. */
function buildDiceResult(
  playerId: string,
  setId: string,
  physicsResults: { diceId: string; type: DiceType; value: number }[],
  lastFrame: PhysicsFrame[] | undefined,
): DiceResult {
  const results = physicsResults.map((r) => {
    const finalPose = lastFrame?.find((f) => f.diceId === r.diceId);
    return {
      type: r.type,
      value: r.value,
      finalPosition: finalPose?.position,
      finalRotation: finalPose?.rotation,
    };
  });

  return {
    playerId,
    setId,
    results,
    timestamp: Date.now(),
  };
}

/** Store resting dice state after a successful throw. */
function storeRestingDice(
  rm: RoomManager,
  roomCode: string,
  playerId: string,
  diceTypes: { id: string; type: DiceType }[],
  physicsResults: { diceId: string; value: number }[],
  lastFrame: PhysicsFrame[] | undefined,
  filterIds?: Set<string>,
): void {
  const resultValues: Record<string, number> = {};
  for (const r of physicsResults) {
    if (!filterIds || filterIds.has(r.diceId)) {
      resultValues[r.diceId] = r.value;
    }
  }
  const finalFrames = filterIds
    ? lastFrame?.filter(f => filterIds.has(f.diceId)) ?? []
    : lastFrame ?? [];
  rm.setRestingDice(roomCode, {
    playerId,
    diceTypes,
    finalFrame: finalFrames,
    resultValues,
  });
}

/** Build a fallback DiceResult using random values (when physics fails). */
function buildFallbackResult(
  playerId: string,
  setId: string,
  dice: { type: DiceType; count: number }[],
): DiceResult {
  const results: { type: DiceType; value: number }[] = [];
  for (const die of dice) {
    for (let i = 0; i < die.count; i++) {
      results.push({ type: die.type, value: rollDie(die.type) });
    }
  }
  return {
    playerId,
    setId,
    results,
    timestamp: Date.now(),
  };
}

/** Unlock throw lock in sequential mode. */
function unlockSequentialThrow(
  io: TypedIO,
  rm: RoomManager,
  roomCode: string,
): void {
  const room = rm.getRoom(roomCode);
  if (room?.rollMode === 'sequential') {
    rm.setThrowInProgress(roomCode, null);
    io.to(roomCode).emit('throw:locked', null);
  }
}

// ── Throw execution ──────────────────────────────────────────────────────────

function executeSingleThrow(
  io: TypedIO,
  rm: RoomManager,
  roomCode: string,
  playerId: string,
  set: { dice: { type: DiceType; count: number }[] },
  setId: string,
): void {
  const diceToThrow = expandDiceSet(playerId, setId, set.dice);

  // In sequential mode, clear all other players' dice from the tray
  const room = rm.getRoom(roomCode);
  const isSequential = room?.rollMode === 'sequential';

  const existingDice: ExistingDie[] = [];
  if (isSequential) {
    // Remove other players' resting dice and notify clients
    rm.clearRestingDice(roomCode);
    io.to(roomCode).emit('dice:existing', []);
  } else {
    // Free mode: keep other players' dice as obstacles
    const otherDice = rm.getRestingDiceForOthers(roomCode, playerId);
    for (const pd of otherDice) {
      for (const f of pd.finalFrame) {
        const dt = pd.diceTypes.find(d => d.id === f.diceId);
        if (dt) {
          existingDice.push({
            id: f.diceId,
            type: dt.type,
            position: f.position,
            rotation: f.rotation,
          });
        }
      }
    }
  }

  throwDice(diceToThrow, existingDice)
    .then(({ frames, results: physicsResults }) => {
      io.to(roomCode).emit('dice:physics', {
        playerId,
        allFrames: frames,
        diceTypes: diceToThrow.map(d => ({ id: d.id, type: d.type })),
      });

      const lastFrame = frames[frames.length - 1];
      const diceResult = buildDiceResult(playerId, setId, physicsResults, lastFrame);
      rm.addDiceResult(roomCode, diceResult);

      storeRestingDice(rm, roomCode, playerId, diceToThrow, physicsResults, lastFrame);

      const animationDurationMs = (frames.length / 60) * 1000;
      setTimeout(() => {
        io.to(roomCode).emit('dice:result', diceResult);
        unlockSequentialThrow(io, rm, roomCode);
      }, animationDurationMs);
    })
    .catch((err) => {
      console.error('Physics simulation failed, falling back to random:', err);
      const diceResult = buildFallbackResult(playerId, setId, set.dice);
      rm.addDiceResult(roomCode, diceResult);
      io.to(roomCode).emit('dice:result', diceResult);
      unlockSequentialThrow(io, rm, roomCode);
    });
}

function executeSimultaneousThrow(
  io: TypedIO,
  rm: RoomManager,
  roomCode: string,
): void {
  const room = rm.getRoom(roomCode);
  if (!room) return;

  const readyPlayerIds = [...room.readyPlayers];
  const savedPlayerSets = { ...room.readyPlayerSets };
  const savedSimultaneousSetId = room.simultaneousSetId;
  rm.clearReadyPlayers(roomCode);

  // Determine which set each player throws
  const playerThrows: { playerId: string; setId: string; dice: { type: DiceType; count: number }[] }[] = [];

  if (room.simultaneousSubMode === 'same-set' && savedSimultaneousSetId) {
    const set = room.sets.find(s => s.id === savedSimultaneousSetId);
    if (!set) return;
    for (const pid of readyPlayerIds) {
      playerThrows.push({ playerId: pid, setId: set.id, dice: set.dice });
    }
  } else {
    // Individual mode: each player throws the set they chose (saved before clear)
    for (const pid of readyPlayerIds) {
      const chosenSetId = savedPlayerSets[pid];
      const set = chosenSetId ? room.sets.find(s => s.id === chosenSetId) : room.sets[0];
      if (!set) continue;
      playerThrows.push({ playerId: pid, setId: set.id, dice: set.dice });
    }
  }

  // Build all dice for combined physics simulation
  const allDice: { type: DiceType; id: string }[] = [];
  const playerDiceMap: { playerId: string; diceTypes: { id: string; type: DiceType }[] }[] = [];

  for (const pt of playerThrows) {
    const playerDice = expandDiceSet(pt.playerId, pt.setId, pt.dice);
    allDice.push(...playerDice);
    playerDiceMap.push({ playerId: pt.playerId, diceTypes: playerDice });
  }

  // Clear ALL resting dice and notify clients (simultaneous = fresh tray)
  rm.clearRestingDice(roomCode);
  io.to(roomCode).emit('dice:existing', []);

  const clearReadyState = () => {
    io.to(roomCode).emit('ready:update', {
      readyPlayers: [],
      readyPlayerSets: {},
      simultaneousSetId: null,
    });
  };

  // Run combined physics simulation (no existing obstacles — all dice thrown fresh)
  throwDice(allDice, [])
    .then(({ frames, results: physicsResults }) => {
      // Emit group physics event
      io.to(roomCode).emit('dice:group-physics', {
        players: playerDiceMap,
        allFrames: frames,
      });

      const lastFrame = frames[frames.length - 1];
      const animationDurationMs = (frames.length / 60) * 1000;

      setTimeout(() => {
        // Emit individual results per player
        for (const pt of playerThrows) {
          const playerDice = playerDiceMap.find(p => p.playerId === pt.playerId);
          if (!playerDice) continue;

          const playerDiceIds = new Set(playerDice.diceTypes.map(d => d.id));
          const playerPhysicsResults = physicsResults.filter(r => playerDiceIds.has(r.diceId));
          const diceResult = buildDiceResult(pt.playerId, pt.setId, playerPhysicsResults, lastFrame);

          rm.addDiceResult(roomCode, diceResult);
          io.to(roomCode).emit('dice:result', diceResult);

          // physicsResults contains all players' results; filterIds narrows to this player
          storeRestingDice(rm, roomCode, pt.playerId, playerDice.diceTypes, physicsResults, lastFrame, playerDiceIds);
        }

        clearReadyState();
      }, animationDurationMs);
    })
    .catch((err) => {
      console.error('Simultaneous physics failed, falling back to random:', err);
      for (const pt of playerThrows) {
        const diceResult = buildFallbackResult(pt.playerId, pt.setId, pt.dice);
        rm.addDiceResult(roomCode, diceResult);
        io.to(roomCode).emit('dice:result', diceResult);
      }
      clearReadyState();
    });
}

// ── Main setup function ─────────────────────────────────────────────────────

/**
 * Creates and registers Socket.io event handlers.
 * Accepts an optional RoomManager for testing; defaults to the singleton.
 */
export function createSocketHandler(
  io: TypedIO,
  rm: RoomManager = defaultRoomManager,
): void {
  /** Track socketId -> { roomCode, playerId } */
  const socketMap = new Map<string, SocketMapping>();

  io.on('connection', (socket: TypedSocket) => {
    console.log(`Client connected: ${socket.id}`);

    // ── Auto-reconnect via handshake auth token ───────────────────────────
    const reconnectToken = socket.handshake.auth?.reconnectToken as
      | string
      | undefined;
    if (reconnectToken) {
      const result = rm.reconnectPlayer(reconnectToken, socket.id);
      if (result) {
        const { player, roomCode } = result;
        socket.join(roomCode);
        socketMap.set(socket.id, { roomCode, playerId: player.id });

        const room = rm.getRoom(roomCode);
        if (room) {
          // Send full room state to ALL clients so player list is correct
          // (player ID changed from old socket to new socket)
          io.to(roomCode).emit('room:state', room);

          // Re-send resting dice to OTHER clients (IDs updated on server)
          const restingDice = rm.getRestingDice(roomCode);
          socket.to(roomCode).emit('dice:existing', restingDice);

          // Re-send full state to reconnecting client:
          // 1) Clear stale history + playerDice
          // 2) Restore resting dice (with updated player IDs)
          // 3) Replay history entries
          socket.emit('dice:existing', []);
          socket.emit('dice:existing', restingDice);
          const history = rm.getDiceHistory(roomCode);
          for (const entry of history) {
            socket.emit('dice:result', entry);
          }
        }
        console.log(
          `Player ${player.name} reconnected to room ${roomCode}`,
        );
      }
    }

    // ── room:create ──────────────────────────────────────────────────────

    socket.on('room:create', (data, callback) => {
      const { name, color, requestedCode } = data;
      const { room, reconnectToken } = rm.createRoom(socket.id, name, color, requestedCode);
      socket.join(room.code);
      socketMap.set(socket.id, {
        roomCode: room.code,
        playerId: socket.id,
      });
      // Send full room state to creator (they are already a player)
      socket.emit('room:state', room);
      callback({ code: room.code, reconnectToken });
      console.log(`Room ${room.code} created by ${name} (${socket.id})`);
    });

    // ── room:info (pre-join query) ────────────────────────────────────────

    socket.on('room:info', (data, callback) => {
      const room = rm.getRoom(data.code);
      if (!room) {
        callback(null);
        return;
      }
      callback({
        exists: true,
        takenColors: room.players.map(p => p.color),
        playerNames: room.players.map(p => p.name),
      });
    });

    // ── room:join ────────────────────────────────────────────────────────

    socket.on('room:join', (data, callback) => {
      const { code, name, color } = data;
      const result = rm.joinRoom(code, socket.id, name, color);

      if (!result.success) {
        callback({ success: false, error: result.error });
        return;
      }

      socket.join(code);
      socketMap.set(socket.id, { roomCode: code, playerId: socket.id });

      const room = rm.getRoom(code);
      if (room) {
        // Send full room state to the joining player
        socket.emit('room:state', room);

        // Send existing resting dice so new player sees them
        const restingDice = rm.getRestingDice(code);
        if (restingDice.length > 0) {
          socket.emit('dice:existing', restingDice);
        }

        // Send dice history so new player sees past results
        const history = rm.getDiceHistory(code);
        for (const result of history) {
          socket.emit('dice:result', result);
        }

        // Broadcast to existing players in the room
        const joiningPlayer = room.players.find((p) => p.id === socket.id);
        if (joiningPlayer) {
          socket.to(code).emit('player:joined', joiningPlayer);
        }
      }

      callback({ success: true, reconnectToken: result.reconnectToken });
      console.log(`Player ${name} joined room ${code}`);
    });

    // ── room:lock ────────────────────────────────────────────────────────

    socket.on('room:lock', () => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const room = rm.getRoom(mapping.roomCode);
      if (!room) return;

      let success: boolean;
      if (room.isLocked) {
        success = rm.unlockRoom(mapping.roomCode, socket.id);
      } else {
        success = rm.lockRoom(mapping.roomCode, socket.id);
      }

      if (success) {
        const updatedRoom = rm.getRoom(mapping.roomCode);
        if (updatedRoom) {
          io.to(mapping.roomCode).emit('room:locked', updatedRoom.isLocked);
        }
      }
    });

    // ── room:kick ────────────────────────────────────────────────────────

    socket.on('room:kick', (targetPlayerId) => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const success = rm.kickPlayer(
        mapping.roomCode,
        socket.id,
        targetPlayerId,
      );
      if (!success) return;

      // Notify all clients — send full room state since player was removed
      const updatedRoom = rm.getRoom(mapping.roomCode);
      if (updatedRoom) {
        io.to(mapping.roomCode).emit('room:state', updatedRoom);
      }

      // If the target has an active socket, disconnect it
      const targetMapping = findSocketByPlayerId(targetPlayerId);
      if (targetMapping) {
        const { socketId } = targetMapping;
        socketMap.delete(socketId);

        io.in(mapping.roomCode)
          .fetchSockets()
          .then((sockets) => {
            const kicked = sockets.find(
              (s) => s.id === socketId,
            );
            if (kicked) {
              kicked.leave(mapping.roomCode);
              kicked.disconnect(true);
            }
          });
      }
    });

    // ── dice:throw ───────────────────────────────────────────────────────

    socket.on('dice:throw', (data) => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const room = rm.getRoom(mapping.roomCode);
      if (!room) return;

      // Sequential mode: block if another throw is in progress
      if (room.rollMode === 'sequential') {
        if (room.throwInProgress !== null) return;
        rm.setThrowInProgress(mapping.roomCode, socket.id);
        io.to(mapping.roomCode).emit('throw:locked', socket.id);
      }

      // Simultaneous mode: use dice:ready instead
      if (room.rollMode === 'simultaneous') return;

      const set = room.sets.find((s) => s.id === data.setId);
      if (!set) return;

      executeSingleThrow(io, rm, mapping.roomCode, socket.id, set, data.setId);
    });

    // ── dice:ready (simultaneous mode) ─────────────────────────────────

    socket.on('dice:ready', (data) => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const room = rm.getRoom(mapping.roomCode);
      if (!room || room.rollMode !== 'simultaneous') return;

      const result = rm.setPlayerReady(mapping.roomCode, socket.id, data.setId);
      if (!result) return;

      io.to(mapping.roomCode).emit('ready:update', {
        readyPlayers: result.readyPlayers,
        readyPlayerSets: result.readyPlayerSets,
        simultaneousSetId: room.simultaneousSetId,
      });

      if (result.allReady) {
        executeSimultaneousThrow(io, rm, mapping.roomCode);
      }
    });

    // ── dice:force-throw (host skips AFK) ──────────────────────────────

    socket.on('dice:force-throw', () => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const room = rm.getRoom(mapping.roomCode);
      if (!room || room.hostId !== socket.id) return;
      if (room.rollMode !== 'simultaneous') return;
      if (room.readyPlayers.length === 0) return;

      executeSimultaneousThrow(io, rm, mapping.roomCode);
    });

    // ── roll-mode:change ───────────────────────────────────────────────

    socket.on('roll-mode:change', (data) => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const success = rm.setRollMode(
        mapping.roomCode,
        socket.id,
        data.rollMode,
        data.simultaneousSubMode,
      );

      if (success) {
        const room = rm.getRoom(mapping.roomCode);
        if (room) {
          io.to(mapping.roomCode).emit('roll-mode:changed', {
            rollMode: room.rollMode,
            simultaneousSubMode: room.simultaneousSubMode,
          });
          // Clear any throw lock
          io.to(mapping.roomCode).emit('throw:locked', null);
          io.to(mapping.roomCode).emit('ready:update', {
            readyPlayers: [],
            readyPlayerSets: {},
            simultaneousSetId: null,
          });
        }
      }
    });

    // ── history:clear ───────────────────────────────────────────────────

    socket.on('history:clear', () => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const success = rm.clearDiceHistory(mapping.roomCode, socket.id);
      if (!success) return;

      // Clear all resting dice
      rm.clearRestingDice(mapping.roomCode);

      // Broadcast to all clients to clear their dice and history state
      io.to(mapping.roomCode).emit('dice:existing', []);
      io.to(mapping.roomCode).emit('history:cleared');
    });

    // ── sets:update ──────────────────────────────────────────────────────

    socket.on('sets:update', (sets) => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const room = rm.getRoom(mapping.roomCode);
      if (!room || room.hostId !== socket.id) return;

      // Direct replace — keep client-provided IDs for consistency
      room.sets = sets.map((s) => ({
        id: s.id || `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: s.name,
        dice: s.dice,
      }));

      io.to(mapping.roomCode).emit('sets:changed', room.sets);
    });

    // ── disconnect ───────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const result = rm.disconnectPlayer(socket.id);
      socketMap.delete(socket.id);

      if (!result) return;

      // Notify room of player leaving
      io.to(result.roomCode).emit('player:left', socket.id);

      // If host changed, notify the room
      if (result.newHostId) {
        io.to(result.roomCode).emit('host:changed', result.newHostId);
      }
    });

    // ── Helper: find socket id by player id ──────────────────────────────

    function findSocketByPlayerId(
      playerId: string,
    ): { socketId: string } | null {
      for (const [socketId, mapping] of socketMap) {
        if (mapping.playerId === playerId) {
          return { socketId };
        }
      }
      return null;
    }
  });
}
