// ============================================================
// integrator.ts — Modified Euler (Heun's) integration method
// ============================================================

import { computeDerivatives } from './eom';
import type { StateVector, Controls, AircraftParameters, Derivatives } from '../models/types';

/** Add scaled derivatives to a state vector */
function addDerivatives(state: StateVector, deriv: Derivatives, dt: number): StateVector {
  return {
    north:           state.north           + deriv.dNorth           * dt,
    east:            state.east            + deriv.dEast            * dt,
    down:            state.down            + deriv.dDown            * dt,
    airspeed:        Math.max(1, state.airspeed + deriv.dAirspeed   * dt),
    flightPathAngle: state.flightPathAngle + deriv.dFlightPathAngle * dt,
    heading:         state.heading         + deriv.dHeading         * dt,
  };
}

/**
 * Advance the state vector by one time step using Heun's method
 * (modified Euler / predictor-corrector).
 *
 * Algorithm:
 *   k1 = f(state, controls)
 *   state_pred = state + dt · k1
 *   k2 = f(state_pred, controls)
 *   state_new = state + (dt/2) · (k1 + k2)
 *
 * @param state    Current state vector
 * @param controls Controls applied during the step
 * @param aircraft Aircraft parameters
 * @param dt       Time step (s)
 * @returns New state vector after one integration step
 */
export function modifiedEulerStep(
  state: StateVector,
  controls: Controls,
  aircraft: AircraftParameters,
  dt: number,
): StateVector {
  // Predictor — Euler step
  const k1 = computeDerivatives(state, controls, aircraft);
  const statePred = addDerivatives(state, k1, dt);

  // Corrector — derivatives at predicted state
  const k2 = computeDerivatives(statePred, controls, aircraft);

  // Average derivatives and apply full step
  const avgDeriv: Derivatives = {
    dNorth:           0.5 * (k1.dNorth           + k2.dNorth),
    dEast:            0.5 * (k1.dEast            + k2.dEast),
    dDown:            0.5 * (k1.dDown            + k2.dDown),
    dAirspeed:        0.5 * (k1.dAirspeed        + k2.dAirspeed),
    dFlightPathAngle: 0.5 * (k1.dFlightPathAngle + k2.dFlightPathAngle),
    dHeading:         0.5 * (k1.dHeading         + k2.dHeading),
  };

  return addDerivatives(state, avgDeriv, dt);
}
