import type { Room, Player, DiceSet, DiceResult, DiceType, PlayerRestingDice, PhysicsFrame } from '@/lib/types';
import {
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  RECONNECT_TIMEOUT,
  ROOM_CLEANUP_TIMEOUT,
  PLAYER_COLORS,
} from '@/lib/constants';

// ── Internal types ──────────────────────────────────────────────────────────

interface RoomState {
  room: Room;
  /** Player IDs in join order, used for host transfer */
  joinOrder: string[];
  /** Dice roll history for this room */
  history: DiceResult[];
  /** Reconnect tokens: token -> playerId */
  reconnectTokens: Map<string, string>;
  /** Timers for reconnect expiry per playerId */
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Timer for room cleanup when all players disconnect */
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  /** Per-player resting dice (last throw's final positions) */
  restingDice: Map<string, PlayerRestingDice>;
}

interface DiceStats {
  totalRolls: number;
  sum: number;
  average: number;
  frequencies: Record<string, Record<number, number>>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function generateId(): string {
  return generateToken().slice(0, 12);
}

// ── RoomManager class ───────────────────────────────────────────────────────

export class RoomManager {
  private states = new Map<string, RoomState>();
  /** Map playerId -> room code for fast lookup */
  private playerRoomMap = new Map<string, string>();
  /** Map reconnectToken -> room code */
  private tokenRoomMap = new Map<string, string>();

  // ── Room lifecycle ──────────────────────────────────────────────────────

  createRoom(
    hostId: string,
    name: string,
    color: string
  ): { room: Room; reconnectToken: string } {
    let code = generateRoomCode();
    while (this.states.has(code)) {
      code = generateRoomCode();
    }

    const host: Player = {
      id: hostId,
      name,
      color,
      isHost: true,
      connected: true,
    };

    const room: Room = {
      code,
      players: [host],
      sets: [],
      isLocked: false,
      hostId: hostId,
    };

    const reconnectToken = generateToken();

    const state: RoomState = {
      room,
      joinOrder: [hostId],
      history: [],
      reconnectTokens: new Map([[reconnectToken, hostId]]),
      reconnectTimers: new Map(),
      cleanupTimer: null,
      restingDice: new Map(),
    };

    this.states.set(code, state);
    this.playerRoomMap.set(hostId, code);
    this.tokenRoomMap.set(reconnectToken, code);

    return { room, reconnectToken };
  }

  getRoom(code: string): Room | undefined {
    return this.states.get(code)?.room;
  }

  // ── Joining ─────────────────────────────────────────────────────────────

  joinRoom(
    code: string,
    playerId: string,
    name: string,
    color: string
  ): { success: boolean; error?: string; reconnectToken?: string } {
    const state = this.states.get(code);
    if (!state) return { success: false, error: 'Room not found' };

    const { room } = state;

    if (room.isLocked) return { success: false, error: 'Room is locked' };

    if (room.players.length >= MAX_PLAYERS) {
      return { success: false, error: 'Room is full (max ' + MAX_PLAYERS + ' players)' };
    }

    const colorTaken = room.players.some((p) => p.color === color);
    if (colorTaken) return { success: false, error: 'That color is already taken' };

    const player: Player = {
      id: playerId,
      name,
      color,
      isHost: false,
      connected: true,
    };

    room.players.push(player);
    state.joinOrder.push(playerId);
    this.playerRoomMap.set(playerId, code);

    const reconnectToken = generateToken();
    state.reconnectTokens.set(reconnectToken, playerId);
    this.tokenRoomMap.set(reconnectToken, code);

    // If a cleanup timer was running (all were disconnected), cancel it
    if (state.cleanupTimer !== null) {
      clearTimeout(state.cleanupTimer);
      state.cleanupTimer = null;
    }

    return { success: true, reconnectToken };
  }

  // ── Player disconnect / reconnect ───────────────────────────────────────

  disconnectPlayer(
    playerId: string
  ): { roomCode: string; newHostId?: string } | null {
    const code = this.playerRoomMap.get(playerId);
    if (!code) return null;

    const state = this.states.get(code);
    if (!state) return null;

    const player = state.room.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.connected = false;

    let newHostId: string | undefined;

    // Host transfer if disconnected player was host
    if (state.room.hostId === playerId) {
      const nextHost = state.joinOrder
        .filter((id) => id !== playerId)
        .map((id) => state.room.players.find((p) => p.id === id))
        .find((p) => p && p.connected);

      if (nextHost) {
        player.isHost = false;
        nextHost.isHost = true;
        state.room.hostId = nextHost.id;
        newHostId = nextHost.id;
      }
    }

    // Set reconnect timeout -- remove player slot after RECONNECT_TIMEOUT
    const timer = setTimeout(() => {
      this.removePlayer(code, playerId);
    }, RECONNECT_TIMEOUT);
    state.reconnectTimers.set(playerId, timer);

    // If all players disconnected, start room cleanup timer
    const anyConnected = state.room.players.some((p) => p.connected);
    if (!anyConnected) {
      if (state.cleanupTimer !== null) {
        clearTimeout(state.cleanupTimer);
      }
      state.cleanupTimer = setTimeout(() => {
        this.deleteRoom(code);
      }, ROOM_CLEANUP_TIMEOUT);
    }

    return { roomCode: code, newHostId };
  }

  reconnectPlayer(
    token: string,
    newSocketId: string
  ): { player: Player; roomCode: string } | null {
    const code = this.tokenRoomMap.get(token);
    if (!code) return null;

    const state = this.states.get(code);
    if (!state) return null;

    const oldPlayerId = state.reconnectTokens.get(token);
    if (!oldPlayerId) return null;

    const player = state.room.players.find((p) => p.id === oldPlayerId);
    if (!player) return null;

    // Cancel reconnect expiry timer
    const timer = state.reconnectTimers.get(oldPlayerId);
    if (timer) {
      clearTimeout(timer);
      state.reconnectTimers.delete(oldPlayerId);
    }

    // Update player id to new socket id
    const oldId = player.id;
    player.id = newSocketId;
    player.connected = true;

    // Update host reference if needed
    if (state.room.hostId === oldId) {
      state.room.hostId = newSocketId;
    }

    // Update join order
    const idx = state.joinOrder.indexOf(oldId);
    if (idx !== -1) {
      state.joinOrder[idx] = newSocketId;
    }

    // Update player-room map
    this.playerRoomMap.delete(oldId);
    this.playerRoomMap.set(newSocketId, code);

    // Update reconnect token mapping
    state.reconnectTokens.set(token, newSocketId);

    // Cancel room cleanup timer if one was running
    if (state.cleanupTimer !== null) {
      clearTimeout(state.cleanupTimer);
      state.cleanupTimer = null;
    }

    return { player, roomCode: code };
  }

  // ── Host actions ────────────────────────────────────────────────────────

  lockRoom(code: string, requesterId: string): boolean {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return false;
    state.room.isLocked = true;
    return true;
  }

  unlockRoom(code: string, requesterId: string): boolean {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return false;
    state.room.isLocked = false;
    return true;
  }

  kickPlayer(code: string, requesterId: string, targetId: string): boolean {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return false;
    if (targetId === requesterId) return false; // can't kick yourself
    return this.removePlayer(code, targetId);
  }

  // ── Dice Sets ───────────────────────────────────────────────────────────

  createDiceSet(
    code: string,
    requesterId: string,
    name: string,
    dice: { type: DiceType; count: number }[]
  ): DiceSet | null {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return null;

    const set: DiceSet = {
      id: generateId(),
      name,
      dice,
    };

    state.room.sets.push(set);
    return set;
  }

  updateDiceSet(
    code: string,
    requesterId: string,
    setId: string,
    name: string,
    dice: { type: DiceType; count: number }[]
  ): DiceSet | null {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return null;

    const set = state.room.sets.find((s) => s.id === setId);
    if (!set) return null;

    set.name = name;
    set.dice = dice;
    return set;
  }

  deleteDiceSet(code: string, requesterId: string, setId: string): boolean {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return false;

    const idx = state.room.sets.findIndex((s) => s.id === setId);
    if (idx === -1) return false;

    state.room.sets.splice(idx, 1);
    return true;
  }

  // ── Dice History ────────────────────────────────────────────────────────

  addDiceResult(code: string, result: DiceResult): void {
    const state = this.states.get(code);
    if (!state) return;
    state.history.push(result);
  }

  getDiceHistory(code: string): DiceResult[] {
    const state = this.states.get(code);
    return state ? [...state.history] : [];
  }

  clearDiceHistory(code: string, requesterId: string): boolean {
    const state = this.states.get(code);
    if (!state || state.room.hostId !== requesterId) return false;
    state.history = [];
    return true;
  }

  // ── Resting Dice State ──────────────────────────────────────────────────

  setRestingDice(code: string, data: PlayerRestingDice): void {
    const state = this.states.get(code);
    if (!state) return;
    state.restingDice.set(data.playerId, data);
  }

  getRestingDice(code: string): PlayerRestingDice[] {
    const state = this.states.get(code);
    if (!state) return [];
    return Array.from(state.restingDice.values());
  }

  getRestingDiceForOthers(code: string, excludePlayerId: string): PlayerRestingDice[] {
    const state = this.states.get(code);
    if (!state) return [];
    return Array.from(state.restingDice.values()).filter(d => d.playerId !== excludePlayerId);
  }

  clearRestingDice(code: string): void {
    const state = this.states.get(code);
    if (!state) return;
    state.restingDice.clear();
  }

  getDiceStats(code: string): DiceStats {
    const state = this.states.get(code);
    if (!state || state.history.length === 0) {
      return { totalRolls: 0, sum: 0, average: 0, frequencies: {} };
    }

    let sum = 0;
    let totalDice = 0;
    const frequencies: Record<string, Record<number, number>> = {};

    for (const roll of state.history) {
      for (const die of roll.results) {
        sum += die.value;
        totalDice++;
        if (!frequencies[die.type]) frequencies[die.type] = {};
        frequencies[die.type][die.value] = (frequencies[die.type][die.value] || 0) + 1;
      }
    }

    return {
      totalRolls: state.history.length,
      sum,
      average: totalDice > 0 ? sum / totalDice : 0,
      frequencies,
    };
  }

  // ── Color management ────────────────────────────────────────────────────

  getAvailableColors(code: string): string[] {
    const state = this.states.get(code);
    if (!state) return [...PLAYER_COLORS];

    const takenColors = new Set(state.room.players.map((p) => p.color));
    return PLAYER_COLORS.filter((c) => !takenColors.has(c));
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private removePlayer(code: string, playerId: string): boolean {
    const state = this.states.get(code);
    if (!state) return false;

    const idx = state.room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return false;

    state.room.players.splice(idx, 1);
    state.joinOrder = state.joinOrder.filter((id) => id !== playerId);
    this.playerRoomMap.delete(playerId);

    // Clean up reconnect timer
    const timer = state.reconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      state.reconnectTimers.delete(playerId);
    }

    // Clean up reconnect tokens for this player
    for (const [token, pid] of state.reconnectTokens) {
      if (pid === playerId) {
        state.reconnectTokens.delete(token);
        this.tokenRoomMap.delete(token);
      }
    }

    // If room is now empty, delete it
    if (state.room.players.length === 0) {
      this.deleteRoom(code);
      return true;
    }

    // If removed player was host, transfer
    if (state.room.hostId === playerId) {
      const nextHost = state.joinOrder
        .map((id) => state.room.players.find((p) => p.id === id))
        .find((p) => p !== undefined);
      if (nextHost) {
        nextHost.isHost = true;
        state.room.hostId = nextHost.id;
      }
    }

    return true;
  }

  private deleteRoom(code: string): void {
    const state = this.states.get(code);
    if (!state) return;

    // Clear all timers
    for (const timer of state.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    if (state.cleanupTimer !== null) {
      clearTimeout(state.cleanupTimer);
    }

    // Clean up maps
    for (const player of state.room.players) {
      this.playerRoomMap.delete(player.id);
    }
    for (const token of state.reconnectTokens.keys()) {
      this.tokenRoomMap.delete(token);
    }

    this.states.delete(code);
  }

  /** Clean up all timers. Call in tests or on shutdown. */
  dispose(): void {
    for (const code of [...this.states.keys()]) {
      this.deleteRoom(code);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────

export const roomManager = new RoomManager();
