import { describe, it, expect } from 'vitest';
import { throwDice } from '../physics';
import type { DiceType } from '@/lib/types';
import { DICE_SIDES } from '@/lib/constants';

describe('throwDice', () => {
  it('returns frames and results for each die', async () => {
    const dice = [
      { id: 'die-1', type: 'D6' as DiceType },
      { id: 'die-2', type: 'D20' as DiceType },
    ];
    const { frames, results } = await throwDice(dice);

    // Should have at least some simulation frames
    expect(frames.length).toBeGreaterThan(0);
    // Each frame should contain PhysicsFrame entries for each die
    expect(frames[0].length).toBe(2);

    // Should produce a result for each die
    expect(results.length).toBe(2);
    expect(results[0].diceId).toBe('die-1');
    expect(results[1].diceId).toBe('die-2');
  });

  it('produces valid face values within dice range', async () => {
    const allTypes: DiceType[] = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20'];
    const dice = allTypes.map((type, i) => ({ id: `die-${i}`, type }));
    const { results } = await throwDice(dice);

    for (const r of results) {
      const maxVal = DICE_SIDES[r.type];
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(maxVal);
    }
  });

  it('respects the maximum frame cap (no infinite loops)', async () => {
    const dice = [{ id: 'die-1', type: 'D6' as DiceType }];
    const { frames } = await throwDice(dice);

    // Should not exceed 600 frames (10 seconds at 60fps)
    expect(frames.length).toBeLessThanOrEqual(600);
  });

  it('produces valid output for multiple throws', async () => {
    const dice = [{ id: 'die-1', type: 'D6' as DiceType }];

    const result1 = await throwDice(dice);
    const result2 = await throwDice(dice);

    // Both should produce valid output
    expect(result1.frames.length).toBeGreaterThan(0);
    expect(result2.frames.length).toBeGreaterThan(0);
    expect(result1.results[0].value).toBeGreaterThanOrEqual(1);
    expect(result2.results[0].value).toBeGreaterThanOrEqual(1);
  });

  it('final frame positions are within the tray boundaries', async () => {
    const dice = [
      { id: 'die-1', type: 'D6' as DiceType },
      { id: 'die-2', type: 'D8' as DiceType },
      { id: 'die-3', type: 'D20' as DiceType },
    ];
    const { frames } = await throwDice(dice);

    const lastFrame = frames[frames.length - 1];
    for (const pf of lastFrame) {
      // Dice should end up within the tray (12x9 units, centered)
      expect(pf.position.x).toBeGreaterThanOrEqual(-7);
      expect(pf.position.x).toBeLessThanOrEqual(7);
      expect(pf.position.z).toBeGreaterThanOrEqual(-5.5);
      expect(pf.position.z).toBeLessThanOrEqual(5.5);
      // Should be resting on or near the floor (y >= 0)
      expect(pf.position.y).toBeGreaterThanOrEqual(-0.5);
    }
  });
});
