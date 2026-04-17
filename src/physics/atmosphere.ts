// ============================================================
// atmosphere.ts — ISA Standard Atmosphere (two-layer model)
// ============================================================

import type { AtmosphereState } from '../models/types';

/** Gravitational acceleration (m/s²) */
export const G0 = 9.80665;

/** Sea-level air density (kg/m³) */
export const RHO0 = 1.225;

// ISA constants
const T0 = 288.15;        // K  — sea-level temperature
const P0 = 101325;        // Pa — sea-level pressure
const L = 0.0065;         // K/m — troposphere lapse rate
const R = 287.05;         // J/(kg·K) — specific gas constant for dry air
const GAMMA = 1.4;        // ratio of specific heats
const H_TROPO = 11000;    // m — tropopause altitude
const T_TROPO = 216.65;   // K — temperature at tropopause (T0 - L*H_TROPO)

// Pre-compute tropopause pressure for efficiency
const P_TROPO = P0 * Math.pow(T_TROPO / T0, G0 / (R * L));

/**
 * Compute ISA atmosphere properties at a given geometric altitude.
 *
 * @param altitudeM  Altitude above MSL in metres (may be negative near sea level)
 * @returns AtmosphereState with temperature, pressure, density, speed-of-sound, densityRatio
 */
export function getAtmosphere(altitudeM: number): AtmosphereState {
  const alt = Math.max(altitudeM, 0); // clamp below sea level

  let temperature: number;
  let pressure: number;

  if (alt <= H_TROPO) {
    // Troposphere — linear temperature lapse
    temperature = T0 - L * alt;
    pressure = P0 * Math.pow(temperature / T0, G0 / (R * L));
  } else {
    // Stratosphere — isothermal
    temperature = T_TROPO;
    pressure = P_TROPO * Math.exp((-G0 * (alt - H_TROPO)) / (R * T_TROPO));
  }

  const density = pressure / (R * temperature);
  const speedOfSound = Math.sqrt(GAMMA * R * temperature);
  const densityRatio = density / RHO0;

  return { temperature, pressure, density, speedOfSound, densityRatio };
}
