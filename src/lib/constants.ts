export const MAX_PLAYERS = 8;
export const ROOM_CODE_LENGTH = 6;
export const RECONNECT_TIMEOUT = 120_000; // 2 min
export const ROOM_CLEANUP_TIMEOUT = 300_000; // 5 min
export const MAX_DICE_PER_THROW = 30;
export const MAX_SETS_PER_ROOM = 20;
export const MAX_PLAYER_NAME_LENGTH = 20;
export const MAX_SET_NAME_LENGTH = 40;
export const MAX_HISTORY_LENGTH = 500;

export const PLAYER_COLORS = [
  '#E53E3E', // Red
  '#3182CE', // Blue
  '#38A169', // Green
  '#D69E2E', // Yellow
  '#805AD5', // Purple
  '#DD6B20', // Orange
  '#319795', // Teal
  '#D53F8C', // Pink
] as const;

export const DICE_SIDES: Record<string, number> = {
  D4: 4,
  D6: 6,
  D8: 8,
  D10: 10,
  D10X: 10, // Percentile die (00-90)
  D12: 12,
  D20: 20,
};
