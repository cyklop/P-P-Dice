import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomManager } from '../room-manager';
import { PLAYER_COLORS, DICE_SIDES } from '@/lib/constants';
import type { DiceResult } from '@/lib/types';

/**
 * Unit tests for socket handler logic.
 * We test the integration between socket events and room-manager
 * by importing and exercising the handler registration function
 * with mock Socket.io objects.
 */

// ── Mock helpers ────────────────────────────────────────────────────────────

function createMockSocket(id: string, auth: Record<string, string> = {}) {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const rooms = new Set<string>();
  return {
    id,
    handshake: { auth },
    rooms,
    join: vi.fn((room: string) => { rooms.add(room); }),
    leave: vi.fn((room: string) => { rooms.delete(room); }),
    to: vi.fn(() => ({
      emit: vi.fn(),
    })),
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      listeners.set(event, handler);
    }),
    // Test helper: trigger a registered event
    _trigger(event: string, ...args: unknown[]) {
      const handler = listeners.get(event);
      if (!handler) throw new Error(`No handler for ${event}`);
      return handler(...args);
    },
    _listeners: listeners,
  };
}

function createMockIO() {
  const connectionHandlers: ((...args: unknown[]) => unknown)[] = [];
  const mockIO = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      if (event === 'connection') connectionHandlers.push(handler);
    }),
    to: vi.fn(() => ({
      emit: vi.fn(),
    })),
    in: vi.fn(() => ({
      fetchSockets: vi.fn(async () => []),
    })),
    // Test helper to simulate a connection
    _simulateConnection(socket: ReturnType<typeof createMockSocket>) {
      for (const handler of connectionHandlers) {
        handler(socket);
      }
    },
  };
  return mockIO;
}

// ── Import handler after mocks defined ──────────────────────────────────────

import { createSocketHandler } from '../socket-handler';

describe('Socket Handler', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    rm.dispose();
    vi.useRealTimers();
  });

  it('room:create creates a room and returns the code via callback', () => {
    const io = createMockIO();
    const socket = createMockSocket('host-socket-1');

    createSocketHandler(io as unknown as Parameters<typeof createSocketHandler>[0], rm);
    io._simulateConnection(socket);

    const callback = vi.fn();
    socket._trigger('room:create', { name: 'Host', color: '#E53E3E' }, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const code = callback.mock.calls[0][0];
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Room exists in room manager with host
    const room = rm.getRoom(code);
    expect(room).toBeTruthy();
    expect(room!.hostId).toBe('host-socket-1');
    expect(room!.players[0].isHost).toBe(true);

    // Socket joined the Socket.io room
    expect(socket.join).toHaveBeenCalledWith(code);
  });

  it('room:join validates and broadcasts player:joined, sends room:state', () => {
    const io = createMockIO();
    createSocketHandler(io as unknown as Parameters<typeof createSocketHandler>[0], rm);

    // Host creates room
    const hostSocket = createMockSocket('host-1');
    io._simulateConnection(hostSocket);
    let roomCode = '';
    hostSocket._trigger('room:create', { name: 'Host', color: '#E53E3E' }, (code: string) => { roomCode = code; });

    // Joiner connects
    const joinSocket = createMockSocket('joiner-1');
    // Track what gets emitted to the room via the joiner's socket.to()
    const roomEmit = vi.fn();
    joinSocket.to.mockReturnValue({ emit: roomEmit });

    io._simulateConnection(joinSocket);

    const joinCallback = vi.fn();
    joinSocket._trigger('room:join', {
      code: roomCode,
      name: 'Bob',
      color: PLAYER_COLORS[1],
    }, joinCallback);

    // Callback called with success
    expect(joinCallback).toHaveBeenCalledWith(true);

    // Joiner receives room:state
    expect(joinSocket.emit).toHaveBeenCalledWith(
      'room:state',
      expect.objectContaining({ code: roomCode }),
    );

    // Room broadcast player:joined (via joiner socket's .to())
    expect(joinSocket.to).toHaveBeenCalledWith(roomCode);
    expect(roomEmit).toHaveBeenCalledWith(
      'player:joined',
      expect.objectContaining({ id: 'joiner-1', name: 'Bob' }),
    );

    // Join with invalid code fails
    const failCallback = vi.fn();
    const failSocket = createMockSocket('fail-1');
    io._simulateConnection(failSocket);
    failSocket._trigger('room:join', {
      code: 'ZZZZZZ',
      name: 'Carol',
      color: PLAYER_COLORS[2],
    }, failCallback);
    expect(failCallback).toHaveBeenCalledWith(false, 'Room not found');
  });

  it('room:lock and room:kick only work for the host', () => {
    const io = createMockIO();
    createSocketHandler(io as unknown as Parameters<typeof createSocketHandler>[0], rm);

    const hostSocket = createMockSocket('host-1');
    io._simulateConnection(hostSocket);
    let roomCode = '';
    hostSocket._trigger('room:create', { name: 'Host', color: '#E53E3E' }, (code: string) => { roomCode = code; });

    const joinerSocket = createMockSocket('joiner-1');
    io._simulateConnection(joinerSocket);
    joinerSocket._trigger('room:join', {
      code: roomCode,
      name: 'Bob',
      color: PLAYER_COLORS[1],
    }, vi.fn());

    // Non-host cannot lock
    joinerSocket._trigger('room:lock');
    expect(rm.getRoom(roomCode)!.isLocked).toBe(false);

    // Host can lock
    hostSocket._trigger('room:lock');
    expect(rm.getRoom(roomCode)!.isLocked).toBe(true);

    // Host can kick
    hostSocket._trigger('room:kick', 'joiner-1');
    expect(rm.getRoom(roomCode)!.players).toHaveLength(1);
  });

  it('dice:throw runs physics simulation and broadcasts dice:result', { timeout: 20000 }, async () => {
    // The server delays dice:result until after the animation duration
    // Use real timers for this test since physics simulation is async
    vi.useRealTimers();

    const io = createMockIO();
    createSocketHandler(io as unknown as Parameters<typeof createSocketHandler>[0], rm);

    const hostSocket = createMockSocket('host-1');
    io._simulateConnection(hostSocket);
    let roomCode = '';
    hostSocket._trigger('room:create', { name: 'Host', color: '#E53E3E' }, (code: string) => { roomCode = code; });

    // Create a dice set
    const set = rm.createDiceSet(roomCode, 'host-1', 'Attack', [
      { type: 'D6', count: 2 },
      { type: 'D20', count: 1 },
    ]);

    // Track room broadcasts
    const roomEmit = vi.fn();
    io.to.mockReturnValue({ emit: roomEmit });

    hostSocket._trigger('dice:throw', {
      setId: set!.id,
      gesture: { direction: { x: 0, y: 0, z: 1 }, force: 1 },
    });

    // Wait for the async physics simulation to complete
    await vi.waitFor(() => {
      expect(roomEmit).toHaveBeenCalledWith(
        'dice:result',
        expect.objectContaining({
          playerId: 'host-1',
          setId: set!.id,
        }),
      );
    }, { timeout: 15000 });

    // Should have broadcast to the room
    expect(io.to).toHaveBeenCalledWith(roomCode);

    // Find the dice:result call among potentially many dice:physics calls
    const resultCall = roomEmit.mock.calls.find(
      (call: unknown[]) => call[0] === 'dice:result',
    );
    expect(resultCall).toBeDefined();

    const result: DiceResult = resultCall![1];
    expect(result.results).toHaveLength(3); // 2xD6 + 1xD20
    for (const r of result.results) {
      const maxValue = DICE_SIDES[r.type];
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(maxValue);
    }

    // Should also be in dice history
    const history = rm.getDiceHistory(roomCode);
    expect(history).toHaveLength(1);

    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
  });

  it('disconnect triggers host transfer and emits host:changed', () => {
    const io = createMockIO();
    createSocketHandler(io as unknown as Parameters<typeof createSocketHandler>[0], rm);

    const hostSocket = createMockSocket('host-1');
    io._simulateConnection(hostSocket);
    let roomCode = '';
    hostSocket._trigger('room:create', { name: 'Host', color: '#E53E3E' }, (code: string) => { roomCode = code; });

    const joinerSocket = createMockSocket('joiner-1');
    io._simulateConnection(joinerSocket);
    joinerSocket._trigger('room:join', {
      code: roomCode,
      name: 'Bob',
      color: PLAYER_COLORS[1],
    }, vi.fn());

    // Track room broadcasts from io.to
    const roomEmit = vi.fn();
    io.to.mockReturnValue({ emit: roomEmit });

    // Disconnect the host
    hostSocket._trigger('disconnect');

    // Should broadcast host:changed to the room
    expect(io.to).toHaveBeenCalledWith(roomCode);
    expect(roomEmit).toHaveBeenCalledWith('host:changed', 'joiner-1');

    // Also broadcast player:left
    expect(roomEmit).toHaveBeenCalledWith('player:left', 'host-1');
  });
});
