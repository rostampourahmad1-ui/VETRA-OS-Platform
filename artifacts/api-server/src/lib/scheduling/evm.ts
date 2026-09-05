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
// ---------------------------------------------------------------------------

import type { EVMInput, EVMOutput } from "./types";

/**
 * Compute full EVM metrics from input values.
 * Returns zero or fallback values for division-by-zero cases.
 */
export function computeEVM(input: EVMInput): EVMOutput {
  const { plannedValue, earnedValue, actualCost, budgetAtCompletion, bottomUpEstimateToComplete } = input;

  const costVariance = earnedValue - actualCost;
  const scheduleVariance = earnedValue - plannedValue;

  const costPerformanceIndex = actualCost !== 0
    ? safeRound(earnedValue / actualCost)
    : (earnedValue > 0 ? 999.99 : 1.00);

  const schedulePerformanceIndex = plannedValue !== 0
    ? safeRound(earnedValue / plannedValue)
    : (earnedValue > 0 ? 999.99 : 1.00);

  // ── EAC variants ──────────────────────────────────────────────────────────

  // 1. EAC (CPI-based) – assumes future performance matches past CPI  [default]
  const estimateAtCompletion = computeEacCpi(budgetAtCompletion, costPerformanceIndex);

  // 2. EAC (CPI×SPI) – accounts for both cost and schedule efficiency
  const cpiTimesSpi = costPerformanceIndex * schedulePerformanceIndex;
  const eacCpiSpi = cpiTimesSpi > 0.001
    ? safeRound(budgetAtCompletion / cpiTimesSpi)
    : budgetAtCompletion;

  // 3. EAC (bottom-up) – AC + user-supplied bottom-up ETC
  const etcBottomUp = bottomUpEstimateToComplete !== undefined
    ? Math.max(0, safeRound(bottomUpEstimateToComplete))
    : 0;
  const eacBottomUp = bottomUpEstimateToComplete !== undefined
    ? safeRound(actualCost + etcBottomUp)
    : estimateAtCompletion;

  const estimateToComplete = Math.max(0, safeRound(estimateAtCompletion - actualCost));
  const varianceAtCompletion = Math.round((budgetAtCompletion - estimateAtCompletion) * 100) / 100;

  // TCPI = (BAC - EV) / (BAC - AC)
  const remainingBudget = budgetAtCompletion - earnedValue;
  const remainingFunds = budgetAtCompletion - actualCost;
  const toCompletePerformanceIndex = remainingFunds > 0
    ? Math.round((remainingBudget / remainingFunds) * 100) / 100
    : (remainingBudget > 0 ? 999.99 : 1.00);

  return {
    plannedValue,
    earnedValue,
    actualCost,
    costVariance: Math.round(costVariance * 100) / 100,
    scheduleVariance: Math.round(scheduleVariance * 100) / 100,
    costPerformanceIndex,
    schedulePerformanceIndex,
    estimateAtCompletion,
    estimateToComplete,
    varianceAtCompletion,
    toCompletePerformanceIndex,
    eacCpiSpi,
    etcBottomUp,
    eacBottomUp,
  };
}

function computeEacCpi(bac: number, cpi: number): number {
  if (cpi > 0 && cpi < 999) {
    return safeRound(bac / cpi);
  }
  return bac;
}

function safeRound(value: number): number {
  return Math.round(value * 100) / 100;
}