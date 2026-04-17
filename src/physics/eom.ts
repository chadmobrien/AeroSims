// ============================================================
// eom.ts — 3DOF point-mass equations of motion in NED frame
// ============================================================

import { G0, getAtmosphere } from './atmosphere';
import { computeAeroCoefficients, computeAeroForces } from './aerodynamics';
import { computeThrust } from './propulsion';
import type { StateVector, Controls, AircraftParameters, Derivatives } from '../models/types';

/** Minimum airspeed guard (m/s) — prevents division by zero */
const V_MIN = 1.0;

/** Minimum |cos(gamma)| guard — prevents division by zero in heading rate */
const COS_GAMMA_MIN = 0.01;

/**
 * Compute time derivatives of the 3DOF point-mass state vector.
 *
 * Wind-axis EOM:
 *   dV/dt     = (T·cos α − D) / m − g·sin γ
 *   dγ/dt     = [(L + T·sin α)·cos μ / m − g·cos γ] / V
 *   dχ/dt     = [(L + T·sin α)·sin μ / m] / (V · cos γ)
 *
 * NED kinematic equations:
 *   dN/dt = V · cos γ · cos χ
 *   dE/dt = V · cos γ · sin χ
 *   dD/dt = −V · sin γ
 *
 * @param state    Current state vector
 * @param controls Current controls
 * @param aircraft Aircraft parameters
 * @returns Time derivatives of the state vector
 */
export function computeDerivatives(
  state: StateVector,
  controls: Controls,
  aircraft: AircraftParameters,
): Derivatives {
  const { airspeed: V_raw, flightPathAngle: gamma, heading: chi } = state;
  const { throttle, nzb, bank } = controls;

  // Guard airspeed
  const V = Math.max(V_raw, V_MIN);

  // Atmosphere at current altitude
  const altitude = -state.down;
  const atm = getAtmosphere(altitude);

  // Aerodynamics
  const { CL, CD, alpha } = computeAeroCoefficients(V, atm, nzb, aircraft);
  const { lift, drag } = computeAeroForces(V, atm, CL, CD, aircraft);

  // Thrust
  const thrust = computeThrust(throttle, atm.densityRatio, aircraft.thrustModel);

  const mass = aircraft.mass;
  const cosAlpha = Math.cos(alpha);
  const sinAlpha = Math.sin(alpha);
  const sinGamma = Math.sin(gamma);
  const cosGamma = Math.cos(gamma);
  const cosBank = Math.cos(bank);
  const sinBank = Math.sin(bank);

  // Normal force along lift + thrust-component
  const normalForce = lift + thrust * sinAlpha;

  // Longitudinal acceleration (wind-axis)
  const dAirspeed = (thrust * cosAlpha - drag) / mass - G0 * sinGamma;

  // Flight path angle rate
  const dFlightPathAngle = (normalForce * cosBank / mass - G0 * cosGamma) / V;

  // Heading rate — guard against near-vertical flight
  const cosGammaClamped = Math.abs(cosGamma) >= COS_GAMMA_MIN
    ? cosGamma
    : Math.sign(cosGamma) * COS_GAMMA_MIN;
  const dHeading = (normalForce * sinBank / mass) / (V * cosGammaClamped);

  // NED position rates
  const dNorth = V * cosGamma * Math.cos(chi);
  const dEast  = V * cosGamma * Math.sin(chi);
  const dDown  = -V * sinGamma;

  return { dNorth, dEast, dDown, dAirspeed, dFlightPathAngle, dHeading };
}
