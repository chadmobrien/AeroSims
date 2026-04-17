// ============================================================
// useSimulator.ts — React hook wrapping the Simulator class
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { Simulator } from '../simulation/simulator';
import { createLevelFlightEvent } from '../simulation/eventSystem';
import type { StateVector, AircraftParameters, AircraftState } from '../models/types';

/** Display/interval rate (ms) */
const DISPLAY_INTERVAL_MS = 50; // 20 Hz

/** Max physics steps per display frame to avoid UI lockup */
const MAX_STEPS_PER_FRAME = 10;

export interface UseSimulatorReturn {
  currentState: AircraftState | null;
  history: AircraftState[];
  isRunning: boolean;
  simulator: Simulator;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setTimeScale: (scale: number) => void;
}

/**
 * React hook that owns a Simulator instance and drives it via setInterval.
 *
 * @param initialState  Initial StateVector (used for construction + reset)
 * @param aircraft      Aircraft parameters (fixed for the lifetime of the hook)
 */
export function useSimulator(
  initialState: StateVector,
  aircraft: AircraftParameters,
): UseSimulatorReturn {
  // Stable references that survive re-renders
  const simulatorRef = useRef<Simulator | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeScaleRef = useRef<number>(1);

  // React state — only what the UI needs to re-render
  const [currentState, setCurrentState] = useState<AircraftState | null>(null);
  const [history, setHistory] = useState<AircraftState[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // ── Initialise simulator on mount ──────────────────────────
  if (simulatorRef.current === null) {
    const sim = new Simulator(initialState, aircraft);
    sim.eventSystem.addEvent(createLevelFlightEvent());
    simulatorRef.current = sim;

    // Capture initial state for display
    const initState = sim.getAircraftState();
    // These will be set in the effect below
    void initState;
  }

  // Sync initial state into React on mount
  useEffect(() => {
    const sim = simulatorRef.current!;
    setCurrentState(sim.getAircraftState());
    setHistory(sim.stateHistory);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Simulation loop ────────────────────────────────────────

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      const sim = simulatorRef.current;
      if (!sim) return;

      const steps = Math.min(timeScaleRef.current, MAX_STEPS_PER_FRAME);
      for (let i = 0; i < steps; i++) {
        sim.step();
      }

      setCurrentState(sim.getAircraftState());
      setHistory(sim.stateHistory);
    }, DISPLAY_INTERVAL_MS);
  }, [stopInterval]);

  // ── Public controls ────────────────────────────────────────

  const start = useCallback(() => {
    setIsRunning(true);
    startInterval();
  }, [startInterval]);

  const pause = useCallback(() => {
    setIsRunning(false);
    stopInterval();
  }, [stopInterval]);

  const reset = useCallback(() => {
    setIsRunning(false);
    stopInterval();

    const sim = simulatorRef.current!;
    sim.reset(initialState);

    setCurrentState(sim.getAircraftState());
    setHistory(sim.stateHistory);
  }, [initialState, stopInterval]);

  const setTimeScale = useCallback((scale: number) => {
    timeScaleRef.current = Math.max(1, Math.min(10, Math.round(scale)));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopInterval();
    };
  }, [stopInterval]);

  return {
    currentState,
    history,
    isRunning,
    simulator: simulatorRef.current!,
    start,
    pause,
    reset,
    setTimeScale,
  };
}
