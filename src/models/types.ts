// ============================================================
// types.ts — All TypeScript interfaces for AeroSims
// ============================================================

/** Atmosphere state at a given altitude */
export interface AtmosphereState {
  /** Static temperature (K) */
  temperature: number;
  /** Static pressure (Pa) */
  pressure: number;
  /** Air density (kg/m³) */
  density: number;
  /** Speed of sound (m/s) */
  speedOfSound: number;
  /** Density ratio σ = rho / rho0 */
  densityRatio: number;
}

/** 3DOF point-mass state vector in NED frame */
export interface StateVector {
  /** North position (m) */
  north: number;
  /** East position (m) */
  east: number;
  /** Down position (m) — altitude_m = -down */
  down: number;
  /** True airspeed (m/s) */
  airspeed: number;
  /** Flight path angle γ (rad), positive up */
  flightPathAngle: number;
  /** Heading χ (rad), 0 = North, clockwise */
  heading: number;
}

/** Time derivatives of the state vector */
export interface Derivatives {
  dNorth: number;
  dEast: number;
  dDown: number;
  dAirspeed: number;
  dFlightPathAngle: number;
  dHeading: number;
}

/** Pilot/autopilot controls */
export interface Controls {
  /** Engine throttle 0–1 */
  throttle: number;
  /** Body load factor (dimensionless); ~1 for level flight */
  nzb: number;
  /** Bank angle μ (rad), positive = right wing down */
  bank: number;
}

/** Thrust model parameters */
export interface ThrustModel {
  /** Maximum thrust at sea level, full throttle (N) */
  maxThrustSL: number;
}

/** GA aircraft aerodynamic and inertial parameters */
export interface AircraftParameters {
  /** Total mass (kg) */
  mass: number;
  /** Wing reference area (m²) */
  S: number;
  /** Wing aspect ratio */
  AR: number;
  /** Lift-curve slope (per rad) */
  CL_alpha: number;
  /** Zero-lift angle of attack (rad) */
  alpha0: number;
  /** Parasite drag coefficient */
  CD0: number;
  /** Oswald span efficiency factor */
  e: number;
  /** Induced drag factor k = 1/(π × AR × e) */
  k: number;
  /** Maximum lift coefficient */
  CL_max: number;
  /** Propulsion model */
  thrustModel: ThrustModel;
}

/** Aerodynamic coefficients */
export interface AeroCoefficients {
  /** Lift coefficient */
  CL: number;
  /** Drag coefficient */
  CD: number;
  /** Angle of attack (rad) */
  alpha: number;
}

/** Aerodynamic forces */
export interface AeroForces {
  /** Lift force (N) */
  lift: number;
  /** Drag force (N) */
  drag: number;
}

/**
 * Full derived aircraft state for display and event evaluation.
 * Computed from StateVector + controls + atmosphere each time step.
 */
export interface AircraftState {
  // --- from StateVector ---
  north: number;
  east: number;
  down: number;
  airspeed: number;
  flightPathAngle: number;
  heading: number;

  // --- derived ---
  /** Altitude above MSL (m), = -down */
  altitude: number;
  /** Altitude (ft) */
  altitudeFt: number;
  /** Airspeed (kts) */
  airspeedKts: number;
  /** Mach number */
  mach: number;
  /** Climb rate (m/s), = V × sin(gamma) */
  climbRate: number;
  /** Climb rate (fpm) */
  climbRateFpm: number;
  /** Angle of attack (rad) from aero model */
  alpha: number;
  /** Simulation time (s) */
  time: number;

  // --- controls in effect ---
  throttle: number;
  nzb: number;
  bank: number;
}

// ============================================================
// Event system types
// ============================================================

/** Numeric properties of AircraftState that can be used in conditions */
export type ConditionProperty =
  | 'altitude'
  | 'altitudeFt'
  | 'airspeed'
  | 'airspeedKts'
  | 'mach'
  | 'flightPathAngle'
  | 'heading'
  | 'climbRate'
  | 'climbRateFpm'
  | 'alpha'
  | 'time';

/** Comparison operators */
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

/** A single condition on one numeric property of AircraftState */
export interface StateCondition {
  property: ConditionProperty;
  operator: ComparisonOperator;
  value: number;
}

/** A throttle action */
export type ThrottleAction =
  | { type: 'constant'; value: number }
  | { type: 'trim' }                            // level flight: T = D/cos α
  | { type: 'climb-trim'; gammaDeg: number }    // steady climb: T = (D + W·sin γ)/cos α
  | { type: 'fpa-follow' };
  // Pair with 'altitude-pid' Nzb on the same event.
  // Uses the PID's γ_cmd as the argument to climb-trim each timestep.

/** A load-factor action */
export type NzbAction =
  | { type: 'constant'; value: number }
  | { type: 'trim' }                            // level flight: Nzb = cos α
  | { type: 'fpa-control'; targetGammaDeg: number; kP: number }
  // Proportional FPA controller: Nzb = cos(γ_target)·cos(α) + kP·(γ_target − γ)
  | {
      type: 'altitude-pid';
      targetAltitudeFt: number;
      // ── Outer loop: altitude error (m) → γ_cmd (rad) ──────────────
      kP_alt: number;          // proportional gain  (rad / m)
      kI_alt: number;          // integral gain      (rad / (m·s))
      kD_alt: number;          // derivative gain    (rad·s / m)
      integralMaxRad: number;  // anti-windup clamp  (rad)
      maxFpaDeg: number;       // γ_cmd saturation   (°)
      // ── Inner loop: FPA error → Nzb ───────────────────────────────
      kP_fpa: number;          // proportional gain; τ ≈ V/(kP_fpa·g)
    };

/** A bank-angle action */
export interface BankAction {
  type: 'constant';
  /** Bank angle in radians */
  value: number;
}

/** Control action produced by a SimEvent */
export interface ControlAction {
  throttle?: ThrottleAction;
  nzb?: NzbAction;
  bank?: BankAction;
}

/** A simulation event: condition → control action */
export interface SimEvent {
  id: string;
  name: string;
  enabled: boolean;
  /** Higher number = higher priority (wins conflicts) */
  priority: number;
  /** All conditions must be true (AND logic) */
  conditions: StateCondition[];
  action: ControlAction;
  /** Remove event after first trigger */
  oneShot: boolean;
  /** Has been triggered (for oneShot tracking) */
  triggered: boolean;
}
