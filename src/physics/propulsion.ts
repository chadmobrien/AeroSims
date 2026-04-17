// ============================================================
// propulsion.ts — Simple piston/prop density-scaled thrust model
// ============================================================

import type { ThrustModel } from '../models/types';

/**
 * Compute engine thrust using a density-scaled piston/prop model.
 *
 * The exponent 0.85 reflects the partial density sensitivity of a
 * naturally-aspirated piston engine with a fixed-pitch propeller.
 *
 * @param throttle      Throttle setting 0–1
 * @param densityRatio  σ = rho / rho0 (dimensionless)
 * @param thrustModel   Thrust model parameters
 * @returns Thrust (N)
 */
export function computeThrust(
  throttle: number,
  densityRatio: number,
  thrustModel: ThrustModel,
): number {
  const thr = Math.max(0, Math.min(1, throttle));
  const sigma = Math.max(0, densityRatio);
  return thr * thrustModel.maxThrustSL * Math.pow(sigma, 0.85);
}

/**
 * Compute the throttle setting required to produce a specified thrust.
 *
 * @param requiredThrustN  Required thrust (N)
 * @param densityRatio     σ = rho / rho0
 * @param thrustModel      Thrust model parameters
 * @returns Throttle setting clamped to [0, 1]
 */
export function computeTrimThrottle(
  requiredThrustN: number,
  densityRatio: number,
  thrustModel: ThrustModel,
): number {
  const sigma = Math.max(1e-6, densityRatio);
  const maxThrust = thrustModel.maxThrustSL * Math.pow(sigma, 0.85);
  if (maxThrust <= 0) return 1;
  const thr = requiredThrustN / maxThrust;
  return Math.max(0, Math.min(1, thr));
}
