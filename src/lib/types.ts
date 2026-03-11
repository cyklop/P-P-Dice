// Dice types
export type DiceType = 'D4' | 'D6' | 'D8' | 'D10' | 'D10X' | 'D12' | 'D20';

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
  'dice:result': (result: DiceResult) => void;
  'dice:existing': (data: PlayerRestingDice[]) => void;
  'sets:changed': (sets: DiceSet[]) => void;
  'host:changed': (newHostId: string) => void;
  'room:locked': (isLocked: boolean) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { name: string; color: string }, callback: (code: string) => void) => void;
  'room:join': (
    data: { code: string; name: string; color: string },
    callback: (success: boolean, error?: string) => void
  ) => void;
  'room:lock': () => void;
  'room:kick': (playerId: string) => void;
  'dice:throw': (data: { setId: string }) => void;
  'sets:update': (sets: DiceSet[]) => void;
  'history:clear': () => void;
}
