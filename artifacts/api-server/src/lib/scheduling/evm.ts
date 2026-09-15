// ─── EVM (Earned Value Management) Service ─────────────────────────────────────
//
// Standard EVM metrics computed from PV, EV, AC, and BAC.
// Extended forecast variants:
//   EAC (CPI×SPI) = BAC / (CPI * SPI)  – accounts for cost & schedule efficiency
//   EAC (bottom-up) = AC + Bottom-up ETC – uses independent estimates for remaining work
//
// Formulas:
//   CV = EV - AC
//   SV = EV - PV
//   CPI = EV / AC
//   SPI = EV / PV
//   EAC (CPI) = BAC / CPI  (assuming no variance in future performance)  [default]
//   EAC (CPI×SPI) = BAC / (CPI * SPI)
//   EAC (bottom-up) = AC + bottomUpETC
//   ETC = EAC - AC
//   VAC = BAC - EAC
//   TCPI = (BAC - EV) / (BAC - AC)  (to-complete performance index)
//
// MONEY-SAFETY: all monetary values are converted to exact integer cents and
// computed with BigInt arithmetic. No IEEE-754 float arithmetic is used for
// financial values; ratios (CPI/SPI/TCPI) are produced by integer rounding.
// ---------------------------------------------------------------------------

import type { EVMInput, EVMOutput } from "./types";

/** Parse a decimal value into integer cents using exact string arithmetic. */
export function toCents(value: string | number): bigint {
  const s = String(value).trim();
  if (!s) return 0n;
  const negative = s.startsWith("-");
  const abs = negative ? s.slice(1) : s;
  const [whole, fraction = ""] = abs.split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) {
    return 0n;
  }
  const digits = `${whole || "0"}.${(fraction + "00").slice(0, 2)}`;
  const [w, f] = digits.split(".");
  let cents = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  // Half-up rounding when more than 2 fractional decimals were provided.
  if (fraction.length > 2) {
    const next = Number(fraction[2]);
    if (next >= 5) cents += 1n;
  }
  return negative ? -cents : cents;
}

/** Format integer cents back into a fixed decimal string (e.g. "225.83"). */
export function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const frac = String(abs % 100n).padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

/** Integer division with half-up rounding (numerator/denominator >= 0). */
function roundDiv(n: bigint, d: bigint): bigint {
  if (d <= 0n) return 0n;
  return (n + d / 2n) / d;
}

const HUNDRED = 100n;
const THOUSAND = 10000n;

/**
 * Compute full EVM metrics from input values.
 * Returns zero or fallback values for division-by-zero cases.
 */
export function computeEVM(input: EVMInput): EVMOutput {
  // Clamp all monetary values to non-negative (negative values are invalid).
  // Values are held as exact integer cents (BigInt).
  const toNonNegativeCents = (v: string | number | undefined): bigint => {
    if (v === undefined) return 0n;
    const cents = toCents(v);
    return cents < 0n ? 0n : cents;
  };
  const plannedValue = toNonNegativeCents(input.plannedValue);
  const earnedValue = toNonNegativeCents(input.earnedValue);
  const actualCost = toNonNegativeCents(input.actualCost);
  const budgetAtCompletion = toNonNegativeCents(input.budgetAtCompletion);
  const bottomUpEstimateToComplete = input.bottomUpEstimateToComplete !== undefined
    ? toNonNegativeCents(input.bottomUpEstimateToComplete)
    : undefined;

  const costVariance = earnedValue - actualCost;
  const scheduleVariance = earnedValue - plannedValue;

  // CPI/SPI are stored as hundredths (e.g. 0.89 -> 89n).
  const costPerformanceIndex = actualCost !== 0n
    ? roundDiv(earnedValue * HUNDRED, actualCost)
    : (earnedValue > 0n ? 99999n : HUNDRED);

  const schedulePerformanceIndex = plannedValue !== 0n
    ? roundDiv(earnedValue * HUNDRED, plannedValue)
    : (earnedValue > 0n ? 99999n : HUNDRED);

  // ── EAC variants ──────────────────────────────────────────────────────────

  // 1. EAC (CPI-based) – assumes future performance matches past CPI  [default]
  const estimateAtCompletion = computeEacCpi(budgetAtCompletion, costPerformanceIndex);

  // 2. EAC (CPI×SPI) – accounts for both cost and schedule efficiency
  const cpiTimesSpi = costPerformanceIndex * schedulePerformanceIndex;
  const eacCpiSpi = cpiTimesSpi > 0n
    ? roundDiv(budgetAtCompletion * THOUSAND, cpiTimesSpi)
    : budgetAtCompletion;

  // 3. EAC (bottom-up) – AC + user-supplied bottom-up ETC
  const etcBottomUp = bottomUpEstimateToComplete !== undefined
    ? Math.max(0n, bottomUpEstimateToComplete)
    : 0n;
  const eacBottomUp = bottomUpEstimateToComplete !== undefined
    ? actualCost + etcBottomUp
    : estimateAtCompletion;

  const estimateToComplete = estimateAtCompletion > actualCost
    ? estimateAtCompletion - actualCost
    : 0n;
  const varianceAtCompletion = budgetAtCompletion - estimateAtCompletion;

  // TCPI = (BAC - EV) / (BAC - AC), stored as hundredths.
  const remainingBudget = budgetAtCompletion - earnedValue;
  const remainingFunds = budgetAtCompletion - actualCost;
  const toCompletePerformanceIndex = remainingFunds > 0n
    ? roundDiv(remainingBudget * HUNDRED, remainingFunds)
    : (remainingBudget > 0n ? 99999n : HUNDRED);

  const centsToNumber = (cents: bigint): number => Number(cents) / 100;
  const hundredthsToNumber = (hundredths: bigint): number => Number(hundredths) / 100;

  return {
    plannedValue: centsToNumber(plannedValue),
    earnedValue: centsToNumber(earnedValue),
    actualCost: centsToNumber(actualCost),
    costVariance: centsToNumber(costVariance),
    scheduleVariance: centsToNumber(scheduleVariance),
    costPerformanceIndex: hundredthsToNumber(costPerformanceIndex),
    schedulePerformanceIndex: hundredthsToNumber(schedulePerformanceIndex),
    estimateAtCompletion: centsToNumber(estimateAtCompletion),
    estimateToComplete: centsToNumber(estimateToComplete),
    varianceAtCompletion: centsToNumber(varianceAtCompletion),
    toCompletePerformanceIndex: hundredthsToNumber(toCompletePerformanceIndex),
    eacCpiSpi: centsToNumber(eacCpiSpi),
    etcBottomUp: centsToNumber(etcBottomUp),
    eacBottomUp: centsToNumber(eacBottomUp),
  };
}

function computeEacCpi(bac: bigint, cpiHundredths: bigint): bigint {
  if (cpiHundredths > 0n && cpiHundredths < 99900n) {
    return roundDiv(bac * HUNDRED, cpiHundredths);
  }
  return bac;
}