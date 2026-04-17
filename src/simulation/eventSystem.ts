// ============================================================
// eventSystem.ts — State-driven event/control system
// ============================================================

import { getAtmosphere } from '../physics/atmosphere';
import { computeLevelFlightTrim, computeClimbTrim } from '../physics/aerodynamics';
import { computeTrimThrottle } from '../physics/propulsion';
import {
  type PIDConfig,
  type PIDState,
  createPIDState,
  stepPID,
} from '../physics/pid';

const FT_TO_M = 0.3048;
import type {
  AircraftState,
  AircraftParameters,
  AtmosphereState,
  Controls,
  SimEvent,
  StateCondition,
  ControlAction,
  ConditionProperty,
} from '../models/types';

// ────────────────────────────────────────────────────────────
// Condition evaluation
// ────────────────────────────────────────────────────────────

function getProperty(state: AircraftState, prop: ConditionProperty): number {
  return state[prop] as number;
}

function evaluateCondition(state: AircraftState, cond: StateCondition): boolean {
  const val = getProperty(state, cond.property);
  switch (cond.operator) {
    case '>':  return val > cond.value;
    case '<':  return val < cond.value;
    case '>=': return val >= cond.value;
    case '<=': return val <= cond.value;
    case '==': return Math.abs(val - cond.value) < 1e-9;
    case '!=': return Math.abs(val - cond.value) >= 1e-9;
  }
}

function allConditionsPass(state: AircraftState, conditions: StateCondition[]): boolean {
  // An event with no conditions is always active
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(state, c));
}

// ────────────────────────────────────────────────────────────
// Trim helpers
// ────────────────────────────────────────────────────────────

/**
 * Throttle + Nzb for steady level flight.
 * Uses the coupled solve (T·cosα = D, L + T·sinα = W) → Nzb = cosα, T = D/cosα.
 */
function computeLevelTrimControls(
  state: AircraftState,
  aircraft: AircraftParameters,
  atm: AtmosphereState,
): { throttle: number; nzb: number } {
  const trim     = computeLevelFlightTrim(state.airspeed, atm, aircraft);
  const throttle = computeTrimThrottle(trim.thrust, atm.densityRatio, aircraft.thrustModel);
  return { throttle, nzb: trim.nzb };
}

/**
 * Throttle + Nzb for steady climbing/descending flight at a given FPA.
 * Nzb = cosγ·cosα,  T = (D + W·sinγ)/cosα
 */
function computeClimbTrimControls(
  state: AircraftState,
  aircraft: AircraftParameters,
  atm: AtmosphereState,
  gammaDeg: number,
): { throttle: number; nzb: number } {
  const gamma    = gammaDeg * (Math.PI / 180);
  const trim     = computeClimbTrim(state.airspeed, gamma, atm, aircraft);
  const throttle = computeTrimThrottle(trim.thrust, atm.densityRatio, aircraft.thrustModel);
  return { throttle, nzb: trim.nzb };
}

/**
 * Altitude PID outer loop → γ_cmd → Nzb inner loop.
 *
 * Returns the commanded FPA (rad) alongside the Nzb so the throttle
 * handler can use the same γ_cmd for climb-trim without a second solve.
 */
function computeAltitudePidNzb(
  state:   AircraftState,
  action:  Extract<import('../models/types').NzbAction, { type: 'altitude-pid' }>,
  pidState: PIDState,
  dt:      number,
): { gammaCmdRad: number; nzb: number } {
  const maxFpaRad = action.maxFpaDeg * (Math.PI / 180);

  const pidConfig: PIDConfig = {
    kP:          action.kP_alt,
    kI:          action.kI_alt,
    kD:          action.kD_alt,
    outputMin:  -maxFpaRad,
    outputMax:   maxFpaRad,
    integralMax: action.integralMaxRad,
  };

  // Outer loop: altitude error (m) → γ_cmd (rad)
  const altErrorM  = (action.targetAltitudeFt - state.altitudeFt) * FT_TO_M;
  const gammaCmdRad = stepPID(pidConfig, pidState, altErrorM, dt);

  // Inner loop: proportional FPA tracking → Nzb
  const gammaCmdDeg = gammaCmdRad * (180 / Math.PI);
  const nzb = computeFpaControlNzb(state, gammaCmdDeg, action.kP_fpa);

  return { gammaCmdRad, nzb };
}

/**
 * Nzb for a proportional FPA controller.
 *
 *   Nzb = cos(γ_target)·cos(α_current) + kP·(γ_target − γ_current)
 *
 * At γ = γ_target the error term vanishes and Nzb = cosγ_target·cosα,
 * which is exactly the hold condition for that FPA.  kP drives error
 * to zero with time constant τ ≈ V / (kP·g).
 */
function computeFpaControlNzb(
  state: AircraftState,
  targetGammaDeg: number,
  kP: number,
): number {
  const targetGamma = targetGammaDeg * (Math.PI / 180);
  const errorGamma  = targetGamma - state.flightPathAngle;
  const refNzb      = Math.cos(targetGamma) * Math.cos(state.alpha);
  const nzb         = refNzb + kP * errorGamma;
  return Math.max(0.1, Math.min(3.0, nzb));  // clamp to physically sane range
}

// ────────────────────────────────────────────────────────────
// EventSystem class
// ────────────────────────────────────────────────────────────

export class EventSystem {
  events: SimEvent[] = [];
  private pidRegistry: Map<string, PIDState> = new Map();

  addEvent(event: SimEvent): void {
    this.events.push(event);
  }

  removeEvent(id: string): void {
    this.events = this.events.filter((e) => e.id !== id);
    this.pidRegistry.delete(id);
  }

  /**
   * Evaluate all active events against the current aircraft state and
   * merge their control actions into a single Controls object.
   *
   * Evaluation order: ascending priority — higher-priority events override.
   * For 'trim' throttle actions the trim throttle is computed from the
   * current state.
   */
  evaluateControls(
    state: AircraftState,
    aircraft: AircraftParameters,
    atm: AtmosphereState,
    dt: number,
  ): Controls {
    // Default controls (safe fallback)
    let throttle = 0.5;
    let nzb = 1.0;
    let bank = 0.0;

    // Per-event: store gammaCmdRad from altitude-pid so fpa-follow can use it
    const gammaCmdByEvent = new Map<string, number>();

    // Sort ascending by priority so highest priority writes last
    const sorted = [...this.events].sort((a, b) => a.priority - b.priority);

    for (const event of sorted) {
      if (!event.enabled) continue;
      if (event.oneShot && event.triggered) continue;
      if (!allConditionsPass(state, event.conditions)) continue;

      // Event fires — apply action
      const action: ControlAction = event.action;

      // ── Nzb (first, so altitude-pid can store gammaCmdRad for throttle) ──
      if (action.nzb !== undefined) {
        const nAct = action.nzb;
        if (nAct.type === 'constant') {
          nzb = nAct.value;
        } else if (nAct.type === 'trim') {
          nzb = computeLevelTrimControls(state, aircraft, atm).nzb;
        } else if (nAct.type === 'fpa-control') {
          nzb = computeFpaControlNzb(state, nAct.targetGammaDeg, nAct.kP);
        } else if (nAct.type === 'altitude-pid') {
          if (!this.pidRegistry.has(event.id)) {
            this.pidRegistry.set(event.id, createPIDState());
          }
          const pidState = this.pidRegistry.get(event.id)!;
          const { gammaCmdRad, nzb: pidNzb } = computeAltitudePidNzb(state, nAct, pidState, dt);
          nzb = pidNzb;
          gammaCmdByEvent.set(event.id, gammaCmdRad);
        }
      }

      // ── Throttle ────────────────────────────────────────
      if (action.throttle !== undefined) {
        const tAct = action.throttle;
        if (tAct.type === 'constant') {
          throttle = tAct.value;
        } else if (tAct.type === 'trim') {
          throttle = computeLevelTrimControls(state, aircraft, atm).throttle;
        } else if (tAct.type === 'climb-trim') {
          throttle = computeClimbTrimControls(state, aircraft, atm, tAct.gammaDeg).throttle;
        } else if (tAct.type === 'fpa-follow') {
          // Use the gammaCmdRad from the altitude-pid Nzb action on the same event
          const gammaCmdRad = gammaCmdByEvent.get(event.id);
          if (gammaCmdRad !== undefined) {
            const gammaCmdDeg = gammaCmdRad * (180 / Math.PI);
            throttle = computeClimbTrimControls(state, aircraft, atm, gammaCmdDeg).throttle;
          } else {
            // Fallback: level trim
            throttle = computeLevelTrimControls(state, aircraft, atm).throttle;
          }
        }
      }

      if (action.bank !== undefined) {
        bank = action.bank.value;
      }

      // Mark oneShot events as triggered
      if (event.oneShot) {
        event.triggered = true;
      }
    }

    return { throttle, nzb, bank };
  }

  /** Re-enable all oneShot events and clear PID state (e.g. on simulation reset). */
  reset(): void {
    for (const event of this.events) {
      event.triggered = false;
    }
    this.pidRegistry.clear();
  }
}

// ────────────────────────────────────────────────────────────
// Factory functions
// ────────────────────────────────────────────────────────────

/**
 * Create a default level-flight event.
 *
 * Always active (no conditions), priority 1.
 * Throttle = trim (auto-computed), nzb = 1.0, bank = 0.
 */
export function createLevelFlightEvent(): SimEvent {
  return {
    id: 'level-flight-default',
    name: 'Level Flight (Trim)',
    enabled: true,
    priority: 1,
    conditions: [],
    action: {
      throttle: { type: 'trim' },
      nzb:      { type: 'trim' },   // cos(α_trim), not 1.0
      bank:     { type: 'constant', value: 0.0 },
    },
    oneShot: false,
    triggered: false,
  };
}

/**
 * Create a three-phase altitude-change maneuver.
 *
 * Phase 1 — Pull-up:
 *   Nzb = pullUpNzb (default 1.1) at full throttle until FPA reaches targetFpaDeg.
 *   Condition: FPA < targetFpaDeg AND altitude < targetAltFt
 *
 * Phase 2 — Hold FPA:
 *   Proportional FPA controller holds targetFpaDeg.  Throttle = climb-trim.
 *   Condition: FPA >= targetFpaDeg AND altitude < targetAltFt
 *
 * Phase 3 — Level-off:
 *   Proportional FPA controller drives FPA → 0°.  Throttle = level trim.
 *   Condition: altitude >= targetAltFt
 *   At FPA = 0 the controller naturally reduces to level-flight trim.
 *
 * All three events are at priority 10 (override the priority-1 level-flight event).
 *
 * @param initialAltFt  Altitude (ft) when maneuver starts — used to compute target
 * @param deltaAltFt    Desired altitude change (ft, positive = climb)
 * @param opts.pullUpNzb    Nzb during pull-up phase   (default 1.1)
 * @param opts.targetFpaDeg FPA to hold during climb   (default 5°)
 * @param opts.kP           FPA controller proportional gain (default 2.0)
 */
export function createAltitudeChangeManeuver(
  initialAltFt: number,
  deltaAltFt: number,
  opts: { pullUpNzb?: number; targetFpaDeg?: number; kP?: number } = {},
): SimEvent[] {
  const pullUpNzb    = opts.pullUpNzb    ?? 1.1;
  const targetFpaDeg = opts.targetFpaDeg ?? 5.0;
  const kP           = opts.kP           ?? 2.0;
  const targetAltFt  = initialAltFt + deltaAltFt;

  const pullUp: SimEvent = {
    id:   'manvr-pullup',
    name: `Pull-up (Nzb=${pullUpNzb.toFixed(2)}g)`,
    enabled: true,
    priority: 10,
    conditions: [
      { property: 'flightPathAngle', operator: '<',  value: targetFpaDeg * (Math.PI / 180) },
      { property: 'altitudeFt',      operator: '<',  value: targetAltFt },
    ],
    action: {
      throttle: { type: 'constant', value: 1.0 },
      nzb:      { type: 'constant', value: pullUpNzb },
      bank:     { type: 'constant', value: 0.0 },
    },
    oneShot: false,
    triggered: false,
  };

  const holdFpa: SimEvent = {
    id:   'manvr-hold-fpa',
    name: `Hold FPA ${targetFpaDeg}°`,
    enabled: true,
    priority: 10,
    conditions: [
      { property: 'flightPathAngle', operator: '>=', value: targetFpaDeg * (Math.PI / 180) },
      { property: 'altitudeFt',      operator: '<',  value: targetAltFt },
    ],
    action: {
      throttle: { type: 'climb-trim', gammaDeg: targetFpaDeg },
      nzb:      { type: 'fpa-control', targetGammaDeg: targetFpaDeg, kP },
      bank:     { type: 'constant', value: 0.0 },
    },
    oneShot: false,
    triggered: false,
  };

  const levelOff: SimEvent = {
    id:   'manvr-leveloff',
    name: 'Level-off',
    enabled: true,
    priority: 10,
    conditions: [
      { property: 'altitudeFt', operator: '>=', value: targetAltFt },
    ],
    action: {
      throttle: { type: 'trim' },
      nzb:      { type: 'fpa-control', targetGammaDeg: 0, kP },
      bank:     { type: 'constant', value: 0.0 },
    },
    oneShot: false,
    triggered: false,
  };

  return [pullUp, holdFpa, levelOff];
}

/**
 * Create a single-event PID altitude-change maneuver.
 *
 * One always-active event with a cascaded altitude PID:
 *   Outer loop: altitude error (m) → γ_cmd (rad), saturated at ±maxFpaDeg.
 *   Inner loop: FPA error → Nzb (proportional).
 *   Throttle:   climb-trim at γ_cmd (fpa-follow).
 *
 * When altitude error is large the outer loop saturates, commanding maxFpaDeg
 * and the inner loop applies ~1.1–1.2g to reach that FPA — no separate pull-up
 * phase needed and no re-engagement risk.
 *
 * The derivative term (kD_alt) begins reducing γ_cmd ~280 ft before the target,
 * giving the inner FPA loop (τ ≈ V/(kP_fpa·g) ≈ 2.9 s) time to bring FPA to 0°.
 *
 * Gain derivation (for reference):
 *   Deceleration onset distance ≈ (kD_alt·V·sin(maxFpa) − integralMax) / kP_alt
 *   Default: (0.04·56.6·sin5° − 0.03) / 0.003 ≈ 280 ft
 *
 * @param initialAltFt   Current altitude (ft)
 * @param deltaAltFt     Desired altitude change (ft, positive = climb)
 * @param opts.targetFpaDeg  Max FPA magnitude commanded (default 5°)
 * @param opts.kP_alt        Outer loop P gain  (default 0.003 rad/m)
 * @param opts.kI_alt        Outer loop I gain  (default 0.0001 rad/(m·s))
 * @param opts.kD_alt        Outer loop D gain  (default 0.04 rad·s/m)
 * @param opts.integralMaxRad  Anti-windup clamp (default 0.03 rad ≈ 1.7°)
 * @param opts.kP_fpa        Inner FPA P gain   (default 2.0); τ ≈ V/(kP·g)
 */
export function createAltitudePidManeuver(
  initialAltFt: number,
  deltaAltFt: number,
  opts: {
    targetFpaDeg?: number;
    kP_alt?: number;
    kI_alt?: number;
    kD_alt?: number;
    integralMaxRad?: number;
    kP_fpa?: number;
  } = {},
): SimEvent[] {
  const targetFpaDeg   = opts.targetFpaDeg   ?? 5.0;
  const kP_alt         = opts.kP_alt         ?? 0.003;
  const kI_alt         = opts.kI_alt         ?? 0.0001;
  const kD_alt         = opts.kD_alt         ?? 0.04;
  const integralMaxRad = opts.integralMaxRad ?? 0.03;   // ~1.7°
  const kP_fpa         = opts.kP_fpa         ?? 2.0;
  const targetAltFt    = initialAltFt + deltaAltFt;

  const altitudePid: SimEvent = {
    id:   'pid-altitude',
    name: `Alt PID → ${Math.round(targetAltFt).toLocaleString()} ft`,
    enabled: true,
    priority: 10,
    conditions: [],
    action: {
      throttle: { type: 'fpa-follow' },
      nzb: {
        type:             'altitude-pid',
        targetAltitudeFt: targetAltFt,
        kP_alt,
        kI_alt,
        kD_alt,
        integralMaxRad,
        maxFpaDeg:        targetFpaDeg,
        kP_fpa,
      },
      bank: { type: 'constant', value: 0.0 },
    },
    oneShot: false,
    triggered: false,
  };

  return [altitudePid];
}

/** Retrieve atmosphere function — re-exported for convenience */
export { getAtmosphere };
