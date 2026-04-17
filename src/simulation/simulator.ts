// ============================================================
// simulator.ts — Simulation loop manager
// ============================================================

import { getAtmosphere } from '../physics/atmosphere';
import { computeAeroCoefficients } from '../physics/aerodynamics';
import { modifiedEulerStep } from '../physics/integrator';
import { EventSystem } from './eventSystem';
import type {
  StateVector,
  AircraftParameters,
  AircraftState,
  Controls,
  AtmosphereState,
} from '../models/types';

/** Maximum history points kept in memory */
const MAX_HISTORY = 2000;

/** Default integration timestep (s) → 20 Hz */
const DEFAULT_DT = 0.05;

// ────────────────────────────────────────────────────────────
// Helper: derive full AircraftState from StateVector + controls
// ────────────────────────────────────────────────────────────

function deriveAircraftState(
  sv: StateVector,
  controls: Controls,
  aircraft: AircraftParameters,
  simTime: number,
): AircraftState {
  const altitude = -sv.down;
  const atm: AtmosphereState = getAtmosphere(altitude);
  const { alpha } = computeAeroCoefficients(sv.airspeed, atm, controls.nzb, aircraft);

  const airspeedKts = sv.airspeed * 1.94384;
  const mach = sv.airspeed / atm.speedOfSound;
  const climbRate = sv.airspeed * Math.sin(sv.flightPathAngle);
  const altitudeFt = altitude * 3.28084;
  const climbRateFpm = climbRate * 196.85;

  return {
    north: sv.north,
    east: sv.east,
    down: sv.down,
    airspeed: sv.airspeed,
    flightPathAngle: sv.flightPathAngle,
    heading: sv.heading,
    altitude,
    altitudeFt,
    airspeedKts,
    mach,
    climbRate,
    climbRateFpm,
    alpha,
    time: simTime,
    throttle: controls.throttle,
    nzb: controls.nzb,
    bank: controls.bank,
  };
}

// ────────────────────────────────────────────────────────────
// Simulator class
// ────────────────────────────────────────────────────────────

export class Simulator {
  private _stateVector: StateVector;
  private _aircraft: AircraftParameters;
  private _eventSystem: EventSystem;
  private _controls: Controls;
  private _dt: number;
  private _simTime: number;
  private _history: AircraftState[];
  private _currentAircraftState: AircraftState;

  constructor(
    initialState: StateVector,
    aircraft: AircraftParameters,
    dt: number = DEFAULT_DT,
  ) {
    this._stateVector = { ...initialState };
    this._aircraft = aircraft;
    this._eventSystem = new EventSystem();
    this._dt = dt;
    this._simTime = 0;
    this._history = [];

    // Default controls — level flight
    this._controls = { throttle: 0.65, nzb: 1.0, bank: 0.0 };

    // Derive initial aircraft state
    this._currentAircraftState = deriveAircraftState(
      this._stateVector,
      this._controls,
      this._aircraft,
      this._simTime,
    );
    this._history.push({ ...this._currentAircraftState });
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Advance the simulation by one integration timestep.
   * @returns The new AircraftState after the step
   */
  step(): AircraftState {
    const atm = getAtmosphere(-this._stateVector.down);

    // 1. Evaluate events to get controls
    this._controls = this._eventSystem.evaluateControls(
      this._currentAircraftState,
      this._aircraft,
      atm,
      this._dt,
    );

    // 2. Integrate one step
    this._stateVector = modifiedEulerStep(
      this._stateVector,
      this._controls,
      this._aircraft,
      this._dt,
    );

    // 3. Advance simulation time
    this._simTime += this._dt;

    // 4. Derive display state
    this._currentAircraftState = deriveAircraftState(
      this._stateVector,
      this._controls,
      this._aircraft,
      this._simTime,
    );

    // 5. Push to history (ring buffer capped at MAX_HISTORY)
    this._history.push({ ...this._currentAircraftState });
    if (this._history.length > MAX_HISTORY) {
      this._history.shift();
    }

    return this._currentAircraftState;
  }

  /**
   * Run N integration steps at once (for fast-forward / batch mode).
   * @param n Number of steps
   * @returns Array of AircraftState for each step
   */
  runSteps(n: number): AircraftState[] {
    const results: AircraftState[] = [];
    for (let i = 0; i < n; i++) {
      results.push(this.step());
    }
    return results;
  }

  /**
   * Derive the full AircraftState from the current internal state.
   */
  getAircraftState(): AircraftState {
    return { ...this._currentAircraftState };
  }

  // ── Getters ────────────────────────────────────────────────

  get currentState(): AircraftState {
    return { ...this._currentAircraftState };
  }

  get eventSystem(): EventSystem {
    return this._eventSystem;
  }

  get simulationTime(): number {
    return this._simTime;
  }

  get stateHistory(): AircraftState[] {
    return [...this._history];
  }

  // ── Reset ──────────────────────────────────────────────────

  /**
   * Reset the simulator to a new initial state.
   * @param initialState New initial StateVector
   */
  reset(initialState: StateVector): void {
    this._stateVector = { ...initialState };
    this._simTime = 0;
    this._history = [];
    this._controls = { throttle: 0.65, nzb: 1.0, bank: 0.0 };
    this._currentAircraftState = deriveAircraftState(
      this._stateVector,
      this._controls,
      this._aircraft,
      this._simTime,
    );
    this._history.push({ ...this._currentAircraftState });
    this._eventSystem.reset();
  }
}
