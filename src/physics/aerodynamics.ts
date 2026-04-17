// ============================================================
// aerodynamics.ts — GA drag polar, lift, and trim computations
// ============================================================

import { G0 } from './atmosphere';
import type { AtmosphereState, AircraftParameters, AeroCoefficients, AeroForces } from '../models/types';

/**
 * Solve for CL given a body-axis normal load factor (Nzb).
 *
 * Body-to-wind rotation about pitch axis by angle α gives:
 *
 *   Nzb · W = L · cos(α) + D · sin(α)
 *           = q·S · [CL · cos(α) + CD · sin(α)]
 *
 * where α = CL / CL_alpha + alpha0  and  CD = CD0 + k·CL²
 *
 * This is solved with a fixed-point iteration:
 *   CL_{i+1} = (Nzb·W/(q·S) − CD_i · sin(α_i)) / cos(α_i)
 *
 * starting from the wind-frame approximation CL₀ = Nzb·W/(q·S).
 * Converges in ≤ 5 iterations for typical GA flight conditions.
 */
const CL_TOLERANCE = 1e-8;
const MAX_ITER      = 40;

function solveCLFromNzb(
  nzb: number,
  q: number,
  aircraft: AircraftParameters,
): number {
  const { mass, S, CL_alpha, alpha0, CD0, k, CL_max } = aircraft;
  const W      = mass * G0;
  const NzbWqS = (nzb * W) / (q * S);   // Nzb·W / (q·S)

  // Initial guess — wind-frame approximation (ignore α rotation)
  let CL = NzbWqS;

  for (let i = 0; i < MAX_ITER; i++) {
    const alpha  = CL / CL_alpha + alpha0;
    const CD     = CD0 + k * CL * CL;
    const cosA   = Math.cos(alpha);
    const sinA   = Math.sin(alpha);

    // Nzb·W/(q·S) = CL·cos(α) + CD·sin(α)  →  solve for CL
    const CL_new = (NzbWqS - CD * sinA) / cosA;

    if (Math.abs(CL_new - CL) < CL_TOLERANCE) {
      CL = CL_new;
      break;
    }
    CL = CL_new;
  }

  return Math.max(-CL_max, Math.min(CL_max, CL));
}

/**
 * Compute aerodynamic coefficients from commanded body-axis load factor (Nzb).
 *
 * Nzb is the load factor along the body z-axis.  It is related to the
 * wind-frame lift L and drag D through the α rotation:
 *
 *   Nzb · W = L · cos(α) + D · sin(α)
 *
 * This function inverts that relation iteratively to obtain CL, then
 * derives CD and α from the drag polar and lift curve respectively.
 *
 * @param V        True airspeed (m/s)
 * @param atm      Atmosphere state at current altitude
 * @param nzb      Body-axis load factor (dimensionless); 1.0 = level flight
 * @param aircraft Aircraft parameters
 * @returns { CL, CD, alpha }
 */
export function computeAeroCoefficients(
  V: number,
  atm: AtmosphereState,
  nzb: number,
  aircraft: AircraftParameters,
): AeroCoefficients {
  const q = 0.5 * atm.density * V * V;   // dynamic pressure (Pa)

  if (q <= 1e-3) {
    return { CL: 0, CD: aircraft.CD0, alpha: aircraft.alpha0 };
  }

  const CL    = solveCLFromNzb(nzb, q, aircraft);
  const alpha = CL / aircraft.CL_alpha + aircraft.alpha0;
  const CD    = aircraft.CD0 + aircraft.k * CL * CL;

  return { CL, CD, alpha };
}

/**
 * Compute aerodynamic forces from pre-computed coefficients.
 *
 * @param V        True airspeed (m/s)
 * @param atm      Atmosphere state
 * @param CL       Lift coefficient
 * @param CD       Drag coefficient
 * @param aircraft Aircraft parameters
 * @returns { lift, drag } in Newtons
 */
export function computeAeroForces(
  V: number,
  atm: AtmosphereState,
  CL: number,
  CD: number,
  aircraft: AircraftParameters,
): AeroForces {
  const q = 0.5 * atm.density * V * V;
  const lift = q * aircraft.S * CL;
  const drag = q * aircraft.S * CD;
  return { lift, drag };
}

/**
 * Compute the trim lift coefficient for steady level flight (Nzb = 1).
 *
 * Uses the same body-to-wind rotation as computeAeroCoefficients so that
 * trim is self-consistent:  W = L·cos(α) + D·sin(α)
 *
 * @param V        True airspeed (m/s)
 * @param atm      Atmosphere state
 * @param aircraft Aircraft parameters
 * @returns CL required to support aircraft weight in level flight
 */
export function computeTrimCL(
  V: number,
  atm: AtmosphereState,
  aircraft: AircraftParameters,
): number {
  const q = 0.5 * atm.density * V * V;
  if (q <= 1e-3) return aircraft.CL_max;
  return solveCLFromNzb(1.0, q, aircraft);   // Nzb = 1 for level, unbanked flight
}

/**
 * Compute the trim angle of attack for steady level flight.
 *
 * @param V        True airspeed (m/s)
 * @param atm      Atmosphere state
 * @param aircraft Aircraft parameters
 * @returns Angle of attack (rad) for trimmed level flight
 */
export function computeTrimAlpha(
  V: number,
  atm: AtmosphereState,
  aircraft: AircraftParameters,
): number {
  const CL_trim = computeTrimCL(V, atm, aircraft);
  return CL_trim / aircraft.CL_alpha + aircraft.alpha0;
}

/** Result of the coupled level-flight trim solve */
export interface LevelFlightTrim {
  CL:     number;   // lift coefficient
  CD:     number;   // drag coefficient
  alpha:  number;   // angle of attack (rad)
  /** Body load factor for level trim = cos(α) — NOT 1.0 */
  nzb:    number;
  /** Trim thrust (N) = D / cos(α) */
  thrust: number;
}

/**
 * Solve the coupled level-flight trim equations with body-axis thrust.
 *
 * Conditions for steady, unbanked, unaccelerated level flight:
 *   (1) T · cos α = D          (no longitudinal acceleration)
 *   (2) L + T · sin α = W      (no flight-path-angle change)
 *
 * Eliminating T: L = W − D · tan α
 *
 * The body load factor at trim is therefore:
 *   Nzb = (L·cos α + D·sin α) / W = cos α  (NOT 1.0)
 *
 * The iteration:
 *   CL ← (W − q·S·CD · tan α) / (q·S)
 * converges in a few steps because D·tan α ≪ W at cruise.
 *
 * @param V        True airspeed (m/s)
 * @param atm      Atmosphere state at current altitude
 * @param aircraft Aircraft parameters
 */
export function computeLevelFlightTrim(
  V: number,
  atm: AtmosphereState,
  aircraft: AircraftParameters,
): LevelFlightTrim {
  const { mass, S, CL_alpha, alpha0, CD0, k, CL_max } = aircraft;
  const q = 0.5 * atm.density * V * V;
  const W = mass * G0;

  if (q <= 1e-3) {
    return { CL: 0, CD: CD0, alpha: alpha0, nzb: 1, thrust: 0 };
  }

  // Initial guess: classical aerodynamic load factor (Nzb ≈ 1 ≈ cos α for small α)
  let CL = W / (q * S);

  for (let i = 0; i < MAX_ITER; i++) {
    const alpha  = CL / CL_alpha + alpha0;
    const CD     = CD0 + k * CL * CL;
    const tanA   = Math.tan(alpha);

    // From L = W − D·tan α:
    const CL_new = Math.max(-CL_max, Math.min(CL_max, (W - q * S * CD * tanA) / (q * S)));

    if (Math.abs(CL_new - CL) < CL_TOLERANCE) {
      CL = CL_new;
      break;
    }
    CL = CL_new;
  }

  const alpha  = CL / CL_alpha + alpha0;
  const CD     = CD0 + k * CL * CL;
  const D      = q * S * CD;
  const nzb    = Math.cos(alpha);            // exact trim body load factor
  const thrust = D / Math.cos(alpha);        // T = D / cos α

  return { CL, CD, alpha, nzb, thrust };
}

/** Result of the coupled steady-climb trim solve */
export interface ClimbTrim {
  CL:     number;
  CD:     number;
  alpha:  number;   // angle of attack (rad)
  /** Body load factor at steady climb = cos(γ)·cos(α) */
  nzb:    number;
  /** Trim thrust (N) = (D + W·sin γ) / cos α */
  thrust: number;
}

/**
 * Solve the coupled trim equations for steady climbing/descending flight.
 *
 * For a constant flight-path angle γ with body-axis thrust:
 *   (1) T · cos α = D + W · sin γ   (no speed change)
 *   (2) L + T · sin α = W · cos γ   (no FPA change)
 *
 * Eliminating T from (1) into (2):
 *   L = W · cos γ − D · tan α − W · sin γ · tan α
 *     = W · (cos γ − sin γ · tan α) − D · tan α
 *
 * Body load factor: Nzb = (L·cos α + D·sin α)/W = cos γ · cos α
 *
 * Level flight is the special case γ = 0 (use computeLevelFlightTrim for clarity).
 *
 * @param V        True airspeed (m/s)
 * @param gamma    Flight path angle (rad) — positive up
 * @param atm      Atmosphere state at current altitude
 * @param aircraft Aircraft parameters
 */
export function computeClimbTrim(
  V: number,
  gamma: number,
  atm: AtmosphereState,
  aircraft: AircraftParameters,
): ClimbTrim {
  const { mass, S, CL_alpha, alpha0, CD0, k, CL_max } = aircraft;
  const q    = 0.5 * atm.density * V * V;
  const W    = mass * G0;
  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);

  if (q <= 1e-3) {
    return { CL: 0, CD: CD0, alpha: alpha0, nzb: cosG, thrust: W * sinG };
  }

  // Initial guess: ignore α-rotation (same as wind-frame CL)
  let CL = W * cosG / (q * S);

  for (let i = 0; i < MAX_ITER; i++) {
    const alpha  = CL / CL_alpha + alpha0;
    const CD     = CD0 + k * CL * CL;
    const tanA   = Math.tan(alpha);

    // From L = W·(cosγ − sinγ·tanα) − D·tanα:
    const CL_new = Math.max(-CL_max, Math.min(CL_max,
      (W * (cosG - sinG * tanA) - q * S * CD * tanA) / (q * S),
    ));

    if (Math.abs(CL_new - CL) < CL_TOLERANCE) { CL = CL_new; break; }
    CL = CL_new;
  }

  const alpha  = CL / CL_alpha + alpha0;
  const CD     = CD0 + k * CL * CL;
  const D      = q * S * CD;
  const nzb    = cosG * Math.cos(alpha);             // cos γ · cos α
  const thrust = (D + W * sinG) / Math.cos(alpha);  // T = (D + W·sinγ)/cosα

  return { CL, CD, alpha, nzb, thrust };
}
