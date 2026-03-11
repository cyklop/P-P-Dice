import { Server as SocketIOServer, Socket } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DiceResult,
  DiceType,
  PlayerRestingDice,
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
          socket.emit('room:state', room);
          socket.to(roomCode).emit('player:joined', player);
        }
        console.log(
          `Player ${player.name} reconnected to room ${roomCode}`,
        );
      }
    }

    // ── room:create ──────────────────────────────────────────────────────

    socket.on('room:create', (data, callback) => {
      const { name, color } = data;
      const { room } = rm.createRoom(socket.id, name, color);
      socket.join(room.code);
      socketMap.set(socket.id, {
        roomCode: room.code,
        playerId: socket.id,
      });
      // Send full room state to creator (they are already a player)
      socket.emit('room:state', room);
      callback(room.code);
      console.log(`Room ${room.code} created by ${name} (${socket.id})`);
    });

    // ── room:join ────────────────────────────────────────────────────────

    socket.on('room:join', (data, callback) => {
      const { code, name, color } = data;
      const result = rm.joinRoom(code, socket.id, name, color);

      if (!result.success) {
        callback(false, result.error);
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

      callback(true);
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

      // Find the target's socket and disconnect it
      const targetMapping = findSocketByPlayerId(targetPlayerId);
      if (targetMapping) {
        const { socketId } = targetMapping;
        // Notify the kicked player's socket
        io.to(mapping.roomCode).emit('player:left', targetPlayerId);
        socketMap.delete(socketId);

        // Disconnect the kicked socket
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

      const set = room.sets.find((s) => s.id === data.setId);
      if (!set) return;

      // Build dice array with unique IDs for physics simulation
      const diceToThrow: { type: DiceType; id: string }[] = [];
      let dieIndex = 0;
      for (const die of set.dice) {
        for (let i = 0; i < die.count; i++) {
          diceToThrow.push({
            type: die.type,
            id: `${data.setId}-${die.type}-${dieIndex++}`,
          });
        }
      }

      // Collect existing resting dice from OTHER players as static obstacles
      const otherDice = rm.getRestingDiceForOthers(mapping.roomCode, socket.id);
      const existingDice: ExistingDie[] = [];
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

      // Run physics simulation with existing dice as obstacles
      throwDice(diceToThrow, existingDice)
        .then(({ frames, results: physicsResults }) => {
          // Send ALL physics frames in one message for smooth client animation
          io.to(mapping.roomCode).emit('dice:physics', {
            playerId: socket.id,
            allFrames: frames,
            diceTypes: diceToThrow.map(d => ({ id: d.id, type: d.type })),
          });

          // Map physics results back to DiceResult format, include final pose
          const lastFrame = frames[frames.length - 1];
          const results = physicsResults.map((r) => {
            const finalPose = lastFrame?.find((f) => f.diceId === r.diceId);
            return {
              type: r.type,
              value: r.value,
              finalPosition: finalPose?.position,
              finalRotation: finalPose?.rotation,
            };
          });

          const diceResult: DiceResult = {
            playerId: socket.id,
            setId: data.setId,
            results,
            timestamp: Date.now(),
          };

          // Store in history
          rm.addDiceResult(mapping.roomCode, diceResult);

          // Store resting dice state for this player (used for collisions & sync)
          const resultValues: Record<string, number> = {};
          for (const r of physicsResults) {
            resultValues[r.diceId] = r.value;
          }
          rm.setRestingDice(mapping.roomCode, {
            playerId: socket.id,
            diceTypes: diceToThrow.map(d => ({ id: d.id, type: d.type })),
            finalFrame: lastFrame,
            resultValues,
          });

          // Delay result broadcast until after the animation plays.
          // Animation duration = number of frames / fps (in ms).
          const animationDurationMs = (frames.length / 60) * 1000;
          setTimeout(() => {
            io.to(mapping.roomCode).emit('dice:result', diceResult);
          }, animationDurationMs);
        })
        .catch((err) => {
          console.error('Physics simulation failed, falling back to random:', err);
          // Fallback to random generation
          const results: { type: DiceType; value: number }[] = [];
          for (const die of set.dice) {
            for (let i = 0; i < die.count; i++) {
              results.push({ type: die.type, value: rollDie(die.type) });
            }
          }

          const diceResult: DiceResult = {
            playerId: socket.id,
            setId: data.setId,
            results,
            timestamp: Date.now(),
          };

          rm.addDiceResult(mapping.roomCode, diceResult);
          io.to(mapping.roomCode).emit('dice:result', diceResult);
        });
    });

    // ── history:clear ───────────────────────────────────────────────────

    socket.on('history:clear', () => {
      const mapping = socketMap.get(socket.id);
      if (!mapping) return;

      const success = rm.clearDiceHistory(mapping.roomCode, socket.id);
      if (!success) return;

      // Clear all resting dice
      rm.clearRestingDice(mapping.roomCode);

      // Broadcast to all clients to clear their dice state
      io.to(mapping.roomCode).emit('dice:existing', []);
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

// ── Legacy export for backward compatibility ────────────────────────────────

/**
 * Sets up Socket.io event handlers using the default room manager singleton.
 */
export function setupSocketHandlers(io: TypedIO): void {
  createSocketHandler(io);
}
