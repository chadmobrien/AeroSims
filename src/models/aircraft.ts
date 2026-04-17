// ============================================================
// aircraft.ts — Cessna 172-class GA aircraft parameters
// ============================================================

import type { AircraftParameters } from './types';

/**
 * Cessna 172-class general aviation aircraft parameters.
 *
 * References:
 *   - Mass: 1111 kg (2450 lbs gross weight)
 *   - Wing area: 16.17 m² (174 ft²)
 *   - Aspect ratio: 7.32
 *   - Engine: ~180 HP (134 kW) piston, fixed-pitch prop → ~2100 N SL thrust
 */
export const GA_AIRCRAFT: AircraftParameters = {
  mass: 1111,       // kg
  S: 16.17,         // m²
  AR: 7.32,
  CL_alpha: 5.73,   // per rad  (≈ 2π × 0.912 efficiency)
  alpha0: -0.0349,  // rad  (−2°)
  CD0: 0.0270,
  e: 0.80,
  k: 1 / (Math.PI * 7.32 * 0.80),  // ≈ 0.05472
  CL_max: 1.6,
  thrustModel: {
    maxThrustSL: 2100,  // N
  },
};
