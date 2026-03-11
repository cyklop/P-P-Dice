/**
 * Automated test: throws each dice type multiple times and validates
 * that the computed face values are within the expected range.
 */
import { throwDice } from '../src/server/physics';

const DICE_TYPES = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20'] as const;
const THROWS_PER_TYPE = 5;

const EXPECTED_RANGE: Record<string, { min: number; max: number }> = {
  D4:  { min: 1, max: 4 },
  D6:  { min: 1, max: 6 },
  D8:  { min: 1, max: 8 },
  D10: { min: 1, max: 10 },
  D12: { min: 1, max: 12 },
  D20: { min: 1, max: 20 },
};

async function main() {
  let totalThrows = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const valueDistribution: Record<string, Record<number, number>> = {};

  for (const type of DICE_TYPES) {
    valueDistribution[type] = {};
    const range = EXPECTED_RANGE[type];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${type} (expected range: ${range.min}-${range.max})`);
    console.log('='.repeat(60));

    for (let t = 0; t < THROWS_PER_TYPE; t++) {
      const dice = [{ type, id: `test-${type}-${t}` }];
      const { frames, results } = await throwDice(dice);

      for (const r of results) {
        totalThrows++;
        const inRange = r.value >= range.min && r.value <= range.max;

        // Track distribution
        valueDistribution[type][r.value] = (valueDistribution[type][r.value] || 0) + 1;

        if (inRange) {
          totalPassed++;
          console.log(`  ✓ Throw ${t + 1}: ${r.type} = ${r.value} (${frames.length} frames)`);
        } else {
          totalFailed++;
          console.log(`  ✗ Throw ${t + 1}: ${r.type} = ${r.value} ← OUT OF RANGE! (${frames.length} frames)`);
        }
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total throws: ${totalThrows}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);

  console.log('\nValue distribution:');
  for (const type of DICE_TYPES) {
    const dist = valueDistribution[type];
    const sorted = Object.entries(dist)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([v, c]) => `${v}×${c}`)
      .join(', ');
    console.log(`  ${type}: ${sorted}`);
  }

  if (totalFailed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED');
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
