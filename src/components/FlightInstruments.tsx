// ============================================================
// FlightInstruments.tsx — SVG analog flight instruments
// ============================================================

import React from 'react';
import type { AircraftState } from '../models/types';

// ────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────

interface InstrumentShellProps {
  title: string;
  children: React.ReactNode;
  size?: number;
}

function InstrumentShell({ title, children, size = 180 }: InstrumentShellProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.05em',
          color: '#94a3b8',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block' }}
      >
        {/* Outer bezel */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} fill="#1e293b" stroke="#475569" strokeWidth={3} />
        {/* Inner face */}
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="#0f172a" />
        {children}
      </svg>
    </div>
  );
}

/** Generate tick marks around a circle */
function CircleTicks({
  cx,
  cy,
  r,
  count,
  majorEvery,
  innerR,
  majorInnerR,
  stroke = '#94a3b8',
  majorStroke = '#e2e8f0',
}: {
  cx: number; cy: number; r: number; count: number; majorEvery: number;
  innerR: number; majorInnerR: number; stroke?: string; majorStroke?: string;
}) {
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360;
    const rad = (angle * Math.PI) / 180;
    const isMajor = i % majorEvery === 0;
    const inner = isMajor ? majorInnerR : innerR;
    const x1 = cx + r * Math.sin(rad);
    const y1 = cy - r * Math.cos(rad);
    const x2 = cx + inner * Math.sin(rad);
    const y2 = cy - inner * Math.cos(rad);
    ticks.push(
      <line
        key={i}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isMajor ? majorStroke : stroke}
        strokeWidth={isMajor ? 2 : 1}
      />,
    );
  }
  return <>{ticks}</>;
}

/** A needle centered on (cx, cy) rotated by angleDeg */
function Needle({
  cx, cy, length, width = 3, color = '#f8fafc', angleDeg, trimLength = 20,
}: {
  cx: number; cy: number; length: number; width?: number;
  color?: string; angleDeg: number; trimLength?: number;
}) {
  return (
    <g transform={`rotate(${angleDeg}, ${cx}, ${cy})`}>
      {/* Tail */}
      <line x1={cx} y1={cy + trimLength} x2={cx} y2={cy} stroke={color} strokeWidth={width} strokeLinecap="round" />
      {/* Head */}
      <line x1={cx} y1={cy} x2={cx} y2={cy - length} stroke={color} strokeWidth={width} strokeLinecap="round" />
      {/* Center cap */}
      <circle cx={cx} cy={cy} r={4} fill="#334155" stroke={color} strokeWidth={1.5} />
    </g>
  );
}

// ────────────────────────────────────────────────────────────
// 1. Airspeed Indicator  (0–200 kts)
// ────────────────────────────────────────────────────────────

function AirspeedIndicator({ state }: { state: AircraftState | null }) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 10;
  const kts = state?.airspeedKts ?? 0;

  // Scale: 0–200 kts maps to -135° to +135° (270° sweep, starting from bottom-left)
  const MIN_KTS = 0;
  const MAX_KTS = 200;
  const SWEEP = 270;
  const START_ANGLE = -135; // degrees from top (12 o'clock)

  const ktsToAngle = (k: number) =>
    START_ANGLE + ((Math.max(MIN_KTS, Math.min(MAX_KTS, k)) - MIN_KTS) / (MAX_KTS - MIN_KTS)) * SWEEP;

  const needleAngle = ktsToAngle(kts);

  // Green arc: 60–125 kts
  const greenStart = ktsToAngle(60);
  const greenEnd = ktsToAngle(125);

  function arcPath(startDeg: number, endDeg: number, radius: number): string {
    const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
    const x1 = CX + radius * Math.cos(toRad(startDeg));
    const y1 = CY + radius * Math.sin(toRad(startDeg));
    const x2 = CX + radius * Math.cos(toRad(endDeg));
    const y2 = CY + radius * Math.sin(toRad(endDeg));
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  }

  // Speed labels at 0, 40, 80, 120, 160, 200
  const labels = [0, 40, 80, 120, 160, 200];

  return (
    <InstrumentShell title="Airspeed" size={SIZE}>
      {/* Green arc */}
      <path d={arcPath(greenStart, greenEnd, R - 4)} fill="none" stroke="#22c55e" strokeWidth={5} />

      {/* Ticks */}
      <CircleTicks cx={CX} cy={CY} r={R} count={40} majorEvery={4} innerR={R - 8} majorInnerR={R - 14} />

      {/* Labels */}
      {labels.map((k) => {
        const a = ktsToAngle(k);
        const rad = ((a - 90) * Math.PI) / 180;
        const lR = R - 22;
        const x = CX + lR * Math.cos(rad);
        const y = CY + lR * Math.sin(rad);
        return (
          <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#cbd5e1" fontFamily="monospace">
            {k}
          </text>
        );
      })}

      {/* Units label */}
      <text x={CX} y={CY + 28} textAnchor="middle" fontSize={9} fill="#64748b">KTS</text>

      {/* Digital readout */}
      <text x={CX} y={CY + 42} textAnchor="middle" fontSize={11} fill="#e2e8f0" fontFamily="monospace">
        {kts.toFixed(1)}
      </text>

      {/* Needle */}
      <Needle cx={CX} cy={CY} length={R - 20} angleDeg={needleAngle} color="#f8fafc" />
    </InstrumentShell>
  );
}

// ────────────────────────────────────────────────────────────
// 2. Altimeter (0–10000 ft, two-hand)
// ────────────────────────────────────────────────────────────

function Altimeter({ state }: { state: AircraftState | null }) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 10;
  const altFt = state?.altitudeFt ?? 0;

  // 100-ft hand: full rotation every 1000 ft
  const hand100Angle = ((altFt % 1000) / 1000) * 360;
  // 1000-ft hand: full rotation every 10000 ft
  const hand1000Angle = ((altFt % 10000) / 10000) * 360;

  const labels1000 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <InstrumentShell title="Altimeter" size={SIZE}>
      {/* Ticks */}
      <CircleTicks cx={CX} cy={CY} r={R} count={50} majorEvery={5} innerR={R - 7} majorInnerR={R - 14} />

      {/* 1000-ft labels */}
      {labels1000.map((n) => {
        const a = (n / 10) * 360 - 90;
        const rad = (a * Math.PI) / 180;
        const lR = R - 22;
        const x = CX + lR * Math.cos(rad);
        const y = CY + lR * Math.sin(rad);
        return (
          <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#cbd5e1" fontFamily="monospace">
            {n}
          </text>
        );
      })}

      <text x={CX} y={CY + 28} textAnchor="middle" fontSize={9} fill="#64748b">×1000 FT</text>
      <text x={CX} y={CY + 42} textAnchor="middle" fontSize={11} fill="#e2e8f0" fontFamily="monospace">
        {Math.round(altFt).toLocaleString()}
      </text>

      {/* 1000-ft hand (longer) */}
      <Needle cx={CX} cy={CY} length={R - 16} width={2} angleDeg={hand1000Angle} color="#94a3b8" trimLength={12} />
      {/* 100-ft hand (shorter, brighter) */}
      <Needle cx={CX} cy={CY} length={R - 28} width={3} angleDeg={hand100Angle} color="#f8fafc" trimLength={16} />
    </InstrumentShell>
  );
}

// ────────────────────────────────────────────────────────────
// 3. Vertical Speed Indicator (−2000 to +2000 fpm)
// ────────────────────────────────────────────────────────────

function VSI({ state }: { state: AircraftState | null }) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 10;
  const fpm = state?.climbRateFpm ?? 0;

  // −2000..+2000 fpm → −135° to +135° (270° sweep), 0 at top
  // Mapping: 0 fpm = 0°, +2000 = +135°, −2000 = −135°
  const fpmToAngle = (f: number) => {
    const clamped = Math.max(-2000, Math.min(2000, f));
    return (clamped / 2000) * 135;
  };
  const needleAngle = fpmToAngle(fpm);

  const labels = [-2, -1, 0, 1, 2];

  return (
    <InstrumentShell title="Vert Speed" size={SIZE}>
      {/* Ticks */}
      <CircleTicks cx={CX} cy={CY} r={R} count={40} majorEvery={4} innerR={R - 7} majorInnerR={R - 14} />

      {/* Labels at each 500 fpm */}
      {labels.map((n) => {
        const a = (n / 2) * 135 - 90;
        const rad = (a * Math.PI) / 180;
        const lR = R - 22;
        const x = CX + lR * Math.cos(rad);
        const y = CY + lR * Math.sin(rad);
        return (
          <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="#cbd5e1" fontFamily="monospace">
            {n}
          </text>
        );
      })}

      <text x={CX} y={CY + 26} textAnchor="middle" fontSize={9} fill="#64748b">×1000 FPM</text>
      <text x={CX} y={CY + 40} textAnchor="middle" fontSize={11} fill="#e2e8f0" fontFamily="monospace">
        {Math.round(fpm).toLocaleString()}
      </text>

      <Needle cx={CX} cy={CY} length={R - 20} angleDeg={needleAngle} color="#f8fafc" />
    </InstrumentShell>
  );
}

// ────────────────────────────────────────────────────────────
// 4. Heading Indicator (compass rose, aircraft symbol fixed)
// ────────────────────────────────────────────────────────────

function HeadingIndicator({ state }: { state: AircraftState | null }) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 10;
  const headingRad = state?.heading ?? 0;
  const headingDeg = (headingRad * 180) / Math.PI;

  // Compass cardinal labels
  const cardinals = [
    { label: 'N', deg: 0 },
    { label: 'E', deg: 90 },
    { label: 'S', deg: 180 },
    { label: 'W', deg: 270 },
  ];

  return (
    <InstrumentShell title="Heading" size={SIZE}>
      {/* Rotating compass rose */}
      <g transform={`rotate(${-headingDeg}, ${CX}, ${CY})`}>
        {/* 36 tick marks every 10° */}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * 360;
          const rad = ((a - 90) * Math.PI) / 180;
          const isMajor = i % 9 === 0;
          const inner = isMajor ? R - 14 : R - 8;
          const x1 = CX + R * Math.cos(rad);
          const y1 = CY + R * Math.sin(rad);
          const x2 = CX + inner * Math.cos(rad);
          const y2 = CY + inner * Math.sin(rad);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isMajor ? '#e2e8f0' : '#64748b'}
              strokeWidth={isMajor ? 2 : 1} />
          );
        })}

        {/* Degree numbers every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const deg = i * 30;
          const rad = ((deg - 90) * Math.PI) / 180;
          const lR = R - 24;
          const x = CX + lR * Math.cos(rad);
          const y = CY + lR * Math.sin(rad);
          const cardinal = cardinals.find((c) => c.deg === deg);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize={cardinal ? 11 : 9}
              fontWeight={cardinal ? 700 : 400}
              fill={cardinal ? '#f8fafc' : '#94a3b8'}
              fontFamily="monospace">
              {cardinal ? cardinal.label : deg}
            </text>
          );
        })}
      </g>

      {/* Fixed aircraft symbol (triangle pointing up) */}
      <polygon
        points={`${CX},${CY - 22} ${CX - 10},${CY + 12} ${CX},${CY + 6} ${CX + 10},${CY + 12}`}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
      />

      {/* Fixed lubber line at top */}
      <line x1={CX} y1={R + 6} x2={CX} y2={R - 2} stroke="#f59e0b" strokeWidth={3} />

      {/* Digital readout */}
      <text x={CX} y={CY + 40} textAnchor="middle" fontSize={11} fill="#e2e8f0" fontFamily="monospace">
        {((headingDeg % 360 + 360) % 360).toFixed(0).padStart(3, '0')}°
      </text>
    </InstrumentShell>
  );
}

// ────────────────────────────────────────────────────────────
// Main export: all four instruments in a row
// ────────────────────────────────────────────────────────────

interface FlightInstrumentsProps {
  state: AircraftState | null;
}

export function FlightInstruments({ state }: FlightInstrumentsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '12px 8px',
        background: '#0f172a',
        borderRadius: 8,
        border: '1px solid #1e293b',
      }}
    >
      <AirspeedIndicator state={state} />
      <Altimeter state={state} />
      <VSI state={state} />
      <HeadingIndicator state={state} />
    </div>
  );
}
