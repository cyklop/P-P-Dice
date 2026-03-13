import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoomManager } from '../room-manager';
import { PLAYER_COLORS } from '@/lib/constants';

let rm: RoomManager;

beforeEach(() => {
  rm = new RoomManager();
  vi.useFakeTimers();
});

afterEach(() => {
  rm.dispose();
  vi.useRealTimers();
});

describe('Room creation and joining', () => {
  it('creates a room with a 6-char code and adds the host player', () => {
    const { room, reconnectToken } = rm.createRoom('host1', 'Alice', PLAYER_COLORS[0])!;
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].id).toBe('host1');
    expect(room.players[0].isHost).toBe(true);
    expect(room.players[0].connected).toBe(true);
    expect(room.hostId).toBe('host1');
    expect(reconnectToken).toBeTruthy();
  });

  it('allows joining a room, rejects duplicate color, enforces max players and room lock', () => {
    const { room } = rm.createRoom('host1', 'Alice', PLAYER_COLORS[0])!;
    const code = room.code;

    // Join succeeds with different color
    const joinResult = rm.joinRoom(code, 'p2', 'Bob', PLAYER_COLORS[1]);
    expect(joinResult.success).toBe(true);
    expect(rm.getRoom(code)!.players).toHaveLength(2);

    // Duplicate color fails
    const dupColor = rm.joinRoom(code, 'p3', 'Carol', PLAYER_COLORS[0]);
    expect(dupColor.success).toBe(false);
    expect(dupColor.error).toContain('color');

    // Lock room, then join fails
    rm.lockRoom(code, 'host1');
    const locked = rm.joinRoom(code, 'p4', 'Dave', PLAYER_COLORS[2]);
    expect(locked.success).toBe(false);
    expect(locked.error).toContain('locked');
  });
});

describe('Host transfer on disconnect', () => {
  it('transfers host to next player by join order when host disconnects', () => {
    const { room } = rm.createRoom('host1', 'Alice', PLAYER_COLORS[0])!;
    rm.joinRoom(room.code, 'p2', 'Bob', PLAYER_COLORS[1]);
    rm.joinRoom(room.code, 'p3', 'Carol', PLAYER_COLORS[2]);

    const result = rm.disconnectPlayer('host1');
    expect(result?.newHostId).toBe('p2');

    const updated = rm.getRoom(room.code)!;
    expect(updated.hostId).toBe('p2');
    expect(updated.players.find(p => p.id === 'p2')!.isHost).toBe(true);
    expect(updated.players.find(p => p.id === 'host1')!.isHost).toBe(false);
  });
});

describe('Dice sets and history', () => {
  it('manages dice sets (create/update/delete) and records dice history with stats', () => {
    const { room } = rm.createRoom('host1', 'Alice', PLAYER_COLORS[0])!;
    const code = room.code;

    // Create dice set
    const set = rm.createDiceSet(code, 'host1', 'Attack', [
      { type: 'D6', count: 2 },
      { type: 'D8', count: 1 },
    ]);
    expect(set).toBeTruthy();
    expect(set!.name).toBe('Attack');
    expect(rm.getRoom(code)!.sets).toHaveLength(1);

    // Update dice set
    const updated = rm.updateDiceSet(code, 'host1', set!.id, 'Defense', [
      { type: 'D10', count: 1 },
    ]);
    expect(updated).toBeTruthy();
    expect(updated!.name).toBe('Defense');

    // Record dice result and check history
    rm.addDiceResult(code, {
      playerId: 'host1',
      setId: set!.id,
      results: [{ type: 'D10', value: 7 }],
      timestamp: Date.now(),
    });
    rm.addDiceResult(code, {
      playerId: 'host1',
      setId: set!.id,
      results: [{ type: 'D10', value: 3 }],
      timestamp: Date.now(),
    });

    const history = rm.getDiceHistory(code);
    expect(history).toHaveLength(2);

    const stats = rm.getDiceStats(code);
    expect(stats.totalRolls).toBe(2);
    expect(stats.sum).toBe(10);
    expect(stats.average).toBe(5);

    // Delete dice set
    rm.deleteDiceSet(code, 'host1', set!.id);
    expect(rm.getRoom(code)!.sets).toHaveLength(0);
  });
});

describe('Reconnect and room cleanup', () => {
  it('reconnects within timeout, cleans up room after all disconnect and timeout expires', () => {
    const { room, reconnectToken } = rm.createRoom('host1', 'Alice', PLAYER_COLORS[0])!;
    const code = room.code;

    // Disconnect
    rm.disconnectPlayer('host1');
    expect(rm.getRoom(code)!.players[0].connected).toBe(false);

    // Reconnect with token
    const reconnected = rm.reconnectPlayer(reconnectToken, 'newSocketId');
    expect(reconnected).toBeTruthy();
    expect(reconnected!.player.connected).toBe(true);
    expect(reconnected!.player.id).toBe('newSocketId');

    // All disconnect -> room cleaned up after timeout
    rm.disconnectPlayer('newSocketId');
    expect(rm.getRoom(code)).toBeTruthy(); // still exists

    vi.advanceTimersByTime(300_001); // 5 min + 1ms
    expect(rm.getRoom(code)).toBeUndefined(); // cleaned up
  });
});
