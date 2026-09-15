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
const ZERO = 0n;

/** Clamp any decimal value to exact non-negative integer cents. */
export function toNonNegativeCents(value: string | number | undefined | null): bigint {
  if (value === undefined || value === null || value === "") return ZERO;
  const cents = toCents(value);
  return cents < 0n ? ZERO : cents;
}

export interface EVMCentInput {
  plannedValueCents: bigint;
  earnedValueCents: bigint;
  actualCostCents: bigint;
  budgetAtCompletionCents: bigint;
  bottomUpEstimateToCompleteCents?: bigint;
}

export interface EVMCentOutput {
  plannedValueCents: bigint;
  earnedValueCents: bigint;
  actualCostCents: bigint;
  costVarianceCents: bigint;
  scheduleVarianceCents: bigint;
  /** Ratios stored as hundredths (e.g. 89 -> 0.89). */
  costPerformanceIndexH: bigint;
  schedulePerformanceIndexH: bigint;
  estimateAtCompletionCents: bigint;
  estimateToCompleteCents: bigint;
  varianceAtCompletionCents: bigint;
  toCompletePerformanceIndexH: bigint;
  eacCpiSpiCents: bigint;
  etcBottomUpCents: bigint;
  eacBottomUpCents: bigint;
}

/** Core EVM engine. All inputs/outputs are exact integer cents / hundredths. */
export function computeEVMFromCents(input: EVMCentInput): EVMCentOutput {
  const plannedValue = input.plannedValueCents < 0n ? ZERO : input.plannedValueCents;
  const earnedValue = input.earnedValueCents < 0n ? ZERO : input.earnedValueCents;
  const actualCost = input.actualCostCents < 0n ? ZERO : input.actualCostCents;
  const budgetAtCompletion = input.budgetAtCompletionCents < 0n ? ZERO : input.budgetAtCompletionCents;
  const bottomUpEstimateToComplete = input.bottomUpEstimateToCompleteCents !== undefined && input.bottomUpEstimateToCompleteCents > 0n
    ? input.bottomUpEstimateToCompleteCents
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
  const etcBottomUp = bottomUpEstimateToComplete ?? 0n;
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

  return {
    plannedValueCents: plannedValue,
    earnedValueCents: earnedValue,
    actualCostCents: actualCost,
    costVarianceCents: costVariance,
    scheduleVarianceCents: scheduleVariance,
    costPerformanceIndexH: costPerformanceIndex,
    schedulePerformanceIndexH: schedulePerformanceIndex,
    estimateAtCompletionCents: estimateAtCompletion,
    estimateToCompleteCents: estimateToComplete,
    varianceAtCompletionCents: varianceAtCompletion,
    toCompletePerformanceIndexH: toCompletePerformanceIndex,
    eacCpiSpiCents: eacCpiSpi,
    etcBottomUpCents: etcBottomUp,
    eacBottomUpCents: eacBottomUp,
  };
}

function computeEacCpi(bac: bigint, cpiHundredths: bigint): bigint {
  if (cpiHundredths > 0n && cpiHundredths < 99900n) {
    return roundDiv(bac * HUNDRED, cpiHundredths);
  }
  return bac;
}

/** Converts integer cents back to a JS number (for display/UI consumption). */
function centsToNumber(cents: bigint, scale = 2): number {
  const units = 10n ** BigInt(scale);
  const sign = cents < 0n ? -1 : 1;
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / units;
  const rem = abs % units;
  const digits = String(rem).padStart(scale, "0");
  const combined = Number(`${whole}.${digits}`);
  return sign === -1 ? -combined : combined;
}

/**
 * Public EVM API (decimal input/output). Monetary values may be decimal strings
 * or numbers; exact integer-cent math guarantees no float drift.
 */
export function computeEVM(input: EVMInput): EVMOutput {
  const raw = computeEVMFromCents({
    plannedValueCents: toNonNegativeCents(input.plannedValue),
    earnedValueCents: toNonNegativeCents(input.earnedValue),
    actualCostCents: toNonNegativeCents(input.actualCost),
    budgetAtCompletionCents: toNonNegativeCents(input.budgetAtCompletion),
    bottomUpEstimateToCompleteCents: input.bottomUpEstimateToComplete !== undefined
      ? toNonNegativeCents(input.bottomUpEstimateToComplete)
      : undefined,
  });

  return {
    plannedValue: centsToNumber(raw.plannedValueCents),
    earnedValue: centsToNumber(raw.earnedValueCents),
    actualCost: centsToNumber(raw.actualCostCents),
    costVariance: centsToNumber(raw.costVarianceCents),
    scheduleVariance: centsToNumber(raw.scheduleVarianceCents),
    costPerformanceIndex: centsToNumber(raw.costPerformanceIndexH),
    schedulePerformanceIndex: centsToNumber(raw.schedulePerformanceIndexH),
    estimateAtCompletion: centsToNumber(raw.estimateAtCompletionCents),
    estimateToComplete: centsToNumber(raw.estimateToCompleteCents),
    varianceAtCompletion: centsToNumber(raw.varianceAtCompletionCents),
    toCompletePerformanceIndex: centsToNumber(raw.toCompletePerformanceIndexH),
    eacCpiSpi: centsToNumber(raw.eacCpiSpiCents),
    etcBottomUp: centsToNumber(raw.etcBottomUpCents),
    eacBottomUp: centsToNumber(raw.eacBottomUpCents),
  };
}