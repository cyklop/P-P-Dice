/**
 * Comprehensive dice test: 20 throws per type, validates values, checks tilt,
 * reports edge cases and distribution.
 */
import { throwDice } from '../src/server/physics';

const DICE_TYPES = ['D4', 'D6', 'D8', 'D10', 'D12', 'D20'] as const;
const THROWS_PER_TYPE = 20;

const EXPECTED_RANGE: Record<string, { min: number; max: number }> = {
  D4:  { min: 1, max: 4 },
  D6:  { min: 1, max: 6 },
  D8:  { min: 1, max: 8 },
  D10: { min: 1, max: 10 },
  D12: { min: 1, max: 12 },
  D20: { min: 1, max: 20 },
};

// Suppress per-dice console.log from physics.ts during mass testing
const origLog = console.log;
let capturedLogs: string[] = [];
function suppressLogs() {
  capturedLogs = [];
  console.log = (...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.startsWith('[DICE-RESULT]')) {
      capturedLogs.push(msg);
    }
  };
}
function restoreLogs() {
  console.log = origLog;
}

interface ThrowStats {
  type: string;
  value: number;
  tilt: number;
  isOnEdge: boolean;
  isStill: boolean;
  steps: number;
  posY: number;
}

function parseLog(log: string): ThrowStats | null {
  // [DICE-RESULT] id (TYPE): value=N | pos=(x, y, z) | vel=V angVel=AV | tilt=T° | STATUS | steps=S
  const m = log.match(
    /\((\w+)\): value=(\d+) \| pos=\(([^)]+)\) \| vel=([\d.]+) angVel=([\d.]+) \| tilt=([\d.]+)° \| ([\w\s⚠️-]+)\| steps=(\d+)/
  );
  if (!m) return null;
  const [, type, value, pos, vel, angVel, tilt, status, steps] = m;
  const posY = parseFloat(pos.split(',')[1].trim());
  return {
    type,
    value: parseInt(value),
    tilt: parseFloat(tilt),
    isOnEdge: status.includes('ON-EDGE'),
    isStill: status.includes('REST'),
    steps: parseInt(steps),
    posY,
  };
}

async function main() {
  let totalThrows = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalOnEdge = 0;
  const allStats: ThrowStats[] = [];
  const valueDistribution: Record<string, Record<number, number>> = {};

  for (const type of DICE_TYPES) {
    valueDistribution[type] = {};
    const range = EXPECTED_RANGE[type];
    const typeStats: ThrowStats[] = [];

    origLog(`\n${'='.repeat(70)}`);
    origLog(`Testing ${type} — ${THROWS_PER_TYPE} throws (expected range: ${range.min}-${range.max})`);
    origLog('='.repeat(70));

    for (let i = 0; i < THROWS_PER_TYPE; i++) {
      suppressLogs();
      const result = await throwDice([{ type, id: `test-${type}-${i}` }]);
      restoreLogs();

      const r = result.results[0];
      totalThrows++;

      // Parse the captured log
      const stats = capturedLogs.length > 0 ? parseLog(capturedLogs[0]) : null;
      if (stats) {
        typeStats.push(stats);
        allStats.push(stats);
      }

      const inRange = r.value >= range.min && r.value <= range.max;
      if (inRange) {
        totalPassed++;
      } else {
        totalFailed++;
      }

      valueDistribution[type][r.value] = (valueDistribution[type][r.value] || 0) + 1;

      const tiltStr = stats ? `tilt=${stats.tilt.toFixed(1)}°` : 'tilt=?';
      const edgeStr = stats?.isOnEdge ? ' ⚠️ ON-EDGE' : '';
      const stepsStr = stats ? `steps=${stats.steps}` : '';
      const statusIcon = inRange ? '✓' : '✗';

      origLog(
        `  ${statusIcon} Throw ${String(i + 1).padStart(2)}: value=${String(r.value).padStart(2)}` +
        ` | ${tiltStr}${edgeStr} | ${stepsStr}`
      );
    }

    // Type summary
    const edgeCount = typeStats.filter(s => s.isOnEdge).length;
    totalOnEdge += edgeCount;
    const avgTilt = typeStats.reduce((s, t) => s + t.tilt, 0) / typeStats.length;
    const maxTilt = Math.max(...typeStats.map(t => t.tilt));
    const avgSteps = typeStats.reduce((s, t) => s + t.steps, 0) / typeStats.length;
    const values = Object.keys(valueDistribution[type]).map(Number).sort((a, b) => a - b);
    const coverage = values.length;
    const maxPossible = range.max - range.min + 1;

    origLog(`\n  Summary ${type}:`);
    origLog(`    Values seen: ${values.join(', ')} (${coverage}/${maxPossible} possible values)`);
    origLog(`    Avg tilt: ${avgTilt.toFixed(1)}° | Max tilt: ${maxTilt.toFixed(1)}°`);
    origLog(`    On-edge: ${edgeCount}/${THROWS_PER_TYPE}`);
    origLog(`    Avg steps: ${avgSteps.toFixed(0)}`);
    origLog(`    Distribution: ${values.map(v => `${v}×${valueDistribution[type][v]}`).join('  ')}`);
  }

  // Final report
  origLog(`\n${'='.repeat(70)}`);
  origLog('FINAL REPORT');
  origLog('='.repeat(70));
  origLog(`Total throws: ${totalThrows}`);
  origLog(`Passed (in range): ${totalPassed}`);
  origLog(`Failed (out of range): ${totalFailed}`);
  origLog(`On-edge warnings: ${totalOnEdge}/${totalThrows}`);

  if (totalFailed > 0) {
    origLog('\n❌ SOME TESTS FAILED!');
    process.exit(1);
  } else if (totalOnEdge > totalThrows * 0.1) {
    origLog(`\n⚠️  High on-edge rate: ${(totalOnEdge/totalThrows*100).toFixed(1)}%`);
  } else {
    origLog('\n✅ ALL TESTS PASSED!');
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
