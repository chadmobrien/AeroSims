// ============================================================
// pid.ts — Reusable stateless PID controller
//
// The controller is split into immutable config and mutable state
// so it can be stored, serialized, and reset independently.
// All update calls mutate the PIDState in place.
// ============================================================

/** Immutable PID tuning parameters */
export interface PIDConfig {
  /** Proportional gain */
  readonly kP: number;
  /** Integral gain */
  readonly kI: number;
  /** Derivative gain (backward Euler on error signal) */
  readonly kD: number;
  /** Output saturation — lower bound */
  readonly outputMin: number;
  /** Output saturation — upper bound */
  readonly outputMax: number;
  /**
   * Anti-windup clamp on the integral accumulator (absolute value).
   * Prevents the integral from winding up during output saturation.
   * Set to Infinity to disable.
   */
  readonly integralMax: number;
}

/** Mutable controller state — one instance per active controller */
export interface PIDState {
  integral: number;
  /** Previous error value; null on the first call (derivative = 0) */
  lastError: number | null;
}

/** Create a zeroed PID state */
export function createPIDState(): PIDState {
  return { integral: 0, lastError: null };
}

/** Reset a PID state to zero (e.g. on maneuver re-trigger) */
export function resetPIDState(state: PIDState): void {
  state.integral = 0;
  state.lastError = null;
}

/**
 * Advance the PID controller by one timestep.
 *
 * Mutates `state.integral` and `state.lastError` in place,
 * then returns the clamped output.
 *
 * @param config  Immutable tuning parameters
 * @param state   Mutable accumulator (modified in place)
 * @param error   Current error = setpoint − process_variable
 * @param dt      Timestep (s)
 * @returns       Clamped controller output
 */
export function stepPID(
  config: PIDConfig,
  state:  PIDState,
  error:  number,
  dt:     number,
): number {
  // Integral with anti-windup clamp
  state.integral = Math.max(
    -config.integralMax,
    Math.min(config.integralMax, state.integral + error * dt),
  );

  // Derivative — backward Euler; zero on first call to avoid a spike
  const derivative = state.lastError !== null
    ? (error - state.lastError) / dt
    : 0;
  state.lastError = error;

  const raw = config.kP * error + config.kI * state.integral + config.kD * derivative;
  return Math.max(config.outputMin, Math.min(config.outputMax, raw));
}
