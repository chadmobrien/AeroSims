// ============================================================
// App.tsx — Main application layout
// ============================================================

import React, { useState, useCallback } from 'react';
import './App.css';

import { GA_AIRCRAFT } from './models/aircraft';
import { useSimulator } from './hooks/useSimulator';
import { FlightInstruments } from './components/FlightInstruments';
import { FlightPath } from './components/FlightPath';
import { StatePanel } from './components/StatePanel';
import { EventPanel } from './components/EventPanel';
import { createAltitudePidManeuver } from './simulation/eventSystem';

import type { StateVector } from './models/types';

// ────────────────────────────────────────────────────────────
// Initial conditions
// Level flight at 5000 ft (1524 m), 110 kts (56.6 m/s), heading North
// ────────────────────────────────────────────────────────────

const INITIAL_STATE: StateVector = {
  north: 0,
  east: 0,
  down: -1524,     // 5000 ft in NED (down is negative altitude)
  airspeed: 56.6,  // ~110 kts
  flightPathAngle: 0,
  heading: 0,      // North
};

// ────────────────────────────────────────────────────────────
// Control button styles
// ────────────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  padding: '7px 18px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  letterSpacing: '0.02em',
  transition: 'opacity 0.15s',
};

// ────────────────────────────────────────────────────────────
// App
// ────────────────────────────────────────────────────────────

export function App() {
  const {
    currentState,
    history,
    isRunning,
    simulator,
    start,
    pause,
    reset,
    setTimeScale,
  } = useSimulator(INITIAL_STATE, GA_AIRCRAFT);

  const [timeScale, setTimeScaleLocal] = useState<number>(1);

  const handleTimeScale = useCallback((scale: number) => {
    setTimeScaleLocal(scale);
    setTimeScale(scale);
  }, [setTimeScale]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const handleAltitudeChange = useCallback((deltaFt: number) => {
    if (!simulator || !currentState) return;
    // Remove any existing maneuver events before adding the new ones
    simulator.eventSystem.removeEvent('pid-altitude');
    const events = createAltitudePidManeuver(currentState.altitudeFt, deltaFt);
    events.forEach((e) => simulator.eventSystem.addEvent(e));
  }, [simulator, currentState]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: 0 }}>
      {/* ── Header ──────────────────────────────────────── */}
      <header
        style={{
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Logo / title */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', letterSpacing: '-0.03em' }}>
            AeroSims
          </span>
          <span style={{ fontSize: 12, color: '#475569' }}>
            Aircraft Maneuver Simulator — Cessna 172-class GA
          </span>
        </div>

        <a
          href="/AeroSims/aerosims_explainer.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: '#60a5fa',
            textDecoration: 'none',
            border: '1px solid #1e3a5f',
            borderRadius: 5,
            padding: '4px 10px',
            background: '#0f1f38',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          How it works ↗
        </a>

        <div style={{ flex: 1 }} />

        {/* Simulation time */}
        <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#94a3b8' }}>
          T = {currentState ? currentState.time.toFixed(1) : '0.0'} s
        </div>

        {/* Time scale selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Speed:</span>
          {[1, 2, 5].map((s) => (
            <button
              key={s}
              onClick={() => handleTimeScale(s)}
              style={{
                ...btnBase,
                padding: '4px 10px',
                fontSize: 12,
                background: timeScale === s ? '#1d4ed8' : '#1e293b',
                color: timeScale === s ? '#dbeafe' : '#94a3b8',
                border: `1px solid ${timeScale === s ? '#3b82f6' : '#334155'}`,
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Maneuver buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Maneuver:</span>
          <button
            onClick={() => handleAltitudeChange(1000)}
            style={{ ...btnBase, background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f6' }}
            title="Pull up at 1.1G → hold 5° FPA → level off 1000 ft higher"
          >
            Climb +1000 ft
          </button>
          <button
            onClick={() => handleAltitudeChange(-1000)}
            style={{ ...btnBase, background: '#3b1f2a', color: '#fda4af', border: '1px solid #f43f5e' }}
            title="Push down at 0.9G → hold −5° FPA → level off 1000 ft lower"
          >
            Descend −1000 ft
          </button>
        </div>

        {/* Start / Pause / Reset */}
        <div style={{ display: 'flex', gap: 8 }}>
          {!isRunning ? (
            <button
              onClick={start}
              style={{ ...btnBase, background: '#166534', color: '#bbf7d0', border: '1px solid #22c55e' }}
            >
              Start
            </button>
          ) : (
            <button
              onClick={pause}
              style={{ ...btnBase, background: '#713f12', color: '#fef08a', border: '1px solid #eab308' }}
            >
              Pause
            </button>
          )}
          <button
            onClick={handleReset}
            style={{ ...btnBase, background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px' }}>

        {/* Row 1: Instruments + State Panel */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 600px', minWidth: 0 }}>
            <FlightInstruments state={currentState} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <StatePanel state={currentState} />
          </div>
        </div>

        {/* Row 2: Flight Path charts */}
        <div>
          <FlightPath history={history} />
        </div>

        {/* Row 3: Event Panel + Controls hint */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <EventPanel simulator={simulator} />

          {/* Info card */}
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '10px 14px',
              minWidth: 220,
              maxWidth: 300,
              fontSize: 12,
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 11,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Quick Reference
            </div>
            <p style={{ margin: '0 0 6px' }}>
              The <span style={{ color: '#a78bfa' }}>Event System</span> maps aircraft
              state conditions to control actions.
            </p>
            <p style={{ margin: '0 0 6px' }}>
              Add a <strong style={{ color: '#6ee7b7' }}>Level Flight</strong> event for
              auto-trim, or define custom maneuvers with altitude/speed triggers.
            </p>
            <p style={{ margin: '0 0 6px' }}>
              Higher-priority events override lower-priority ones when multiple conditions
              are satisfied simultaneously.
            </p>
            <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
              <span style={{ color: '#475569' }}>dt = 0.05 s (20 Hz Heun)</span>
              <br />
              <span style={{ color: '#475569' }}>ISA atmosphere · GA drag polar</span>
              <br />
              <span style={{ color: '#475569' }}>3DOF point-mass EOM · NED frame</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer
        style={{
          background: '#0f172a',
          borderTop: '1px solid #1e293b',
          padding: '6px 20px',
          fontSize: 11,
          color: '#334155',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        <span>AeroSims v1.0.0 · ISA/3DOF/Heun · React + TypeScript + Vite</span>
        <span>
          {currentState
            ? `Alt: ${Math.round(currentState.altitudeFt).toLocaleString()} ft  ·  `
            + `IAS: ${currentState.airspeedKts.toFixed(1)} kts  ·  `
            + `Mach: ${currentState.mach.toFixed(4)}`
            : 'Simulation not started'}
        </span>
      </footer>
    </div>
  );
}

export default App;
