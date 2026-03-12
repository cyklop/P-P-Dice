// Dice types
export type DiceType = 'D4' | 'D6' | 'D8' | 'D10' | 'D10X' | 'D12' | 'D20';

// Roll modes
export type RollMode = 'free' | 'sequential' | 'simultaneous';
export type SimultaneousSubMode = 'same-set' | 'individual';

// Player
export interface Player {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
}

// Dice Set
export interface DiceSet {
  id: string;
  name: string;
  dice: { type: DiceType; count: number }[];
}

// Room
export interface Room {
  code: string;
  players: Player[];
  sets: DiceSet[];
  isLocked: boolean;
  hostId: string;
  rollMode: RollMode;
  simultaneousSubMode: SimultaneousSubMode;
  /** Player ID of the player currently throwing (sequential mode). null if no throw in progress. */
  throwInProgress: string | null;
  /** Player IDs who clicked "Bereit" (simultaneous mode). */
  readyPlayers: string[];
  /** Per-player set choices: playerId -> setId. */
  readyPlayerSets: Record<string, string>;
  /** Set ID chosen by first player for same-set simultaneous mode. null if individual. */
  simultaneousSetId: string | null;
}

// Throw gesture
export interface ThrowGesture {
  direction: { x: number; y: number; z: number };
  force: number;
}

// Dice result
export interface DiceResult {
  playerId: string;
  setId: string;
  results: {
    type: DiceType;
    value: number;
    finalPosition?: { x: number; y: number; z: number };
    finalRotation?: { x: number; y: number; z: number; w: number };
  }[];
  timestamp: number;
}

// Physics frame for dice animation
export interface PhysicsFrame {
  diceId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

// Resting dice state for a single player (server-stored)
export interface PlayerRestingDice {
  playerId: string;
  diceTypes: { id: string; type: DiceType }[];
  finalFrame: PhysicsFrame[];
  resultValues: Record<string, number>;
}

// Socket events
export interface ServerToClientEvents {
  'room:state': (room: Room) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'dice:physics': (data: { playerId: string; allFrames: PhysicsFrame[][]; diceTypes: { id: string; type: DiceType }[] }) => void;
  /** Multi-player physics for simultaneous mode — multiple players' dice in one simulation. */
  'dice:group-physics': (data: {
    players: { playerId: string; diceTypes: { id: string; type: DiceType }[] }[];
    allFrames: PhysicsFrame[][];
  }) => void;
  'dice:result': (result: DiceResult) => void;
  'dice:existing': (data: PlayerRestingDice[]) => void;
  'sets:changed': (sets: DiceSet[]) => void;
  'host:changed': (newHostId: string) => void;
  'room:locked': (isLocked: boolean) => void;
  'roll-mode:changed': (data: { rollMode: RollMode; simultaneousSubMode: SimultaneousSubMode }) => void;
  'throw:locked': (playerId: string | null) => void;
  'ready:update': (data: { readyPlayers: string[]; readyPlayerSets: Record<string, string>; simultaneousSetId: string | null }) => void;
  'history:cleared': () => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { name: string; color: string; requestedCode?: string }, callback: (data: { code: string; reconnectToken: string }) => void) => void;
  'room:info': (
    data: { code: string },
    callback: (info: { exists: boolean; takenColors: string[]; playerNames: string[] } | null) => void
  ) => void;
  'room:join': (
    data: { code: string; name: string; color: string },
    callback: (data: { success: boolean; error?: string; reconnectToken?: string }) => void
  ) => void;
  'room:lock': () => void;
  'room:kick': (playerId: string) => void;
  'dice:throw': (data: { setId: string }) => void;
  'dice:ready': (data: { setId: string }) => void;
  'dice:force-throw': () => void;
  'sets:update': (sets: DiceSet[]) => void;
  'history:clear': () => void;
  'roll-mode:change': (data: { rollMode: RollMode; simultaneousSubMode?: SimultaneousSubMode }) => void;
}
