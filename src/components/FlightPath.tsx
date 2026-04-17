// ============================================================
// FlightPath.tsx — 2D N-E path + Altitude vs Time chart
// ============================================================

import { useMemo } from 'react';
import type { AircraftState } from '../models/types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const SVG_W = 340;
const SVG_H = 300;
const MARGIN = { top: 24, right: 16, bottom: 36, left: 48 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;

function linMap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

interface NiceRange { lo: number; hi: number; step: number }

function niceRange(min: number, max: number, ticks = 5): NiceRange {
  if (min === max) {
    return { lo: min - 1, hi: max + 1, step: 0.5 };
  }
  const range = max - min;
  const rough = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = Math.ceil(rough / mag) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return { lo, hi, step };
}

// ────────────────────────────────────────────────────────────
// 1. Top-down N-E flight path
// ────────────────────────────────────────────────────────────

function NEPath({ history }: { history: AircraftState[] }) {
  const { points, xRange, yRange } = useMemo(() => {
    if (history.length === 0) {
      return { points: [], xRange: { lo: -1, hi: 1 }, yRange: { lo: -1, hi: 1 } };
    }
    const easts = history.map((s) => s.east);
    const norths = history.map((s) => s.north);
    const eMin = Math.min(...easts);
    const eMax = Math.max(...easts);
    const nMin = Math.min(...norths);
    const nMax = Math.max(...norths);

    // Square the view to preserve N-E aspect ratio
    const span = Math.max(eMax - eMin, nMax - nMin, 200);
    const eCtr = (eMin + eMax) / 2;
    const nCtr = (nMin + nMax) / 2;
    const half = span / 2 * 1.15; // 15% padding

    return {
      points: history.map((s) => ({ e: s.east, n: s.north, t: s.time })),
      xRange: { lo: eCtr - half, hi: eCtr + half },
      yRange: { lo: nCtr - half, hi: nCtr + half },
    };
  }, [history]);

  const toSvg = (e: number, n: number) => ({
    x: MARGIN.left + linMap(e, xRange.lo, xRange.hi, 0, PLOT_W),
    y: MARGIN.top + linMap(n, yRange.hi, yRange.lo, 0, PLOT_H), // invert Y (N up)
  });

  const polyline = useMemo(() => {
    if (points.length < 2) return '';
    return points.map((p) => {
      const { x, y } = toSvg(p.e, p.n);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = points.length > 0 ? toSvg(points[0].e, points[0].n) : null;
  const current = points.length > 0 ? toSvg(points[points.length - 1].e, points[points.length - 1].n) : null;

  // Axis ticks
  const xTicks = useMemo(() => niceRange(xRange.lo, xRange.hi, 4), [xRange]);
  const yTicks = useMemo(() => niceRange(yRange.lo, yRange.hi, 4), [yRange]);

  function axisTicksX() {
    const tks: number[] = [];
    for (let v = xTicks.lo; v <= xTicks.hi + 1e-9; v += xTicks.step) tks.push(v);
    return tks;
  }
  function axisTicksY() {
    const tks: number[] = [];
    for (let v = yTicks.lo; v <= yTicks.hi + 1e-9; v += yTicks.step) tks.push(v);
    return tks;
  }

  return (
    <svg width={SVG_W} height={SVG_H} style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }}>
      {/* Title */}
      <text x={SVG_W / 2} y={14} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="sans-serif">
        N-E Flight Path (m)
      </text>

      {/* Clip */}
      <clipPath id="ne-clip">
        <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} />
      </clipPath>

      {/* Axes */}
      <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + PLOT_H} stroke="#334155" strokeWidth={1} />
      <line x1={MARGIN.left} y1={MARGIN.top + PLOT_H} x2={MARGIN.left + PLOT_W} y2={MARGIN.top + PLOT_H} stroke="#334155" strokeWidth={1} />

      {/* X ticks */}
      {axisTicksX().map((v, i) => {
        const x = MARGIN.left + linMap(v, xRange.lo, xRange.hi, 0, PLOT_W);
        return (
          <g key={i}>
            <line x1={x} y1={MARGIN.top + PLOT_H} x2={x} y2={MARGIN.top + PLOT_H + 4} stroke="#475569" strokeWidth={1} />
            <line x1={x} y1={MARGIN.top} x2={x} y2={MARGIN.top + PLOT_H} stroke="#1e293b" strokeWidth={1} strokeDasharray="3,4" />
            <text x={x} y={MARGIN.top + PLOT_H + 14} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="monospace">
              {(v / 1000).toFixed(1)}k
            </text>
          </g>
        );
      })}

      {/* Y ticks */}
      {axisTicksY().map((v, i) => {
        const y = MARGIN.top + linMap(v, yRange.hi, yRange.lo, 0, PLOT_H);
        return (
          <g key={i}>
            <line x1={MARGIN.left - 4} y1={y} x2={MARGIN.left} y2={y} stroke="#475569" strokeWidth={1} />
            <line x1={MARGIN.left} y1={y} x2={MARGIN.left + PLOT_W} y2={y} stroke="#1e293b" strokeWidth={1} strokeDasharray="3,4" />
            <text x={MARGIN.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#64748b" fontFamily="monospace">
              {(v / 1000).toFixed(1)}k
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      <text x={MARGIN.left + PLOT_W / 2} y={SVG_H - 4} textAnchor="middle" fontSize={9} fill="#64748b">East (m)</text>
      <text x={10} y={MARGIN.top + PLOT_H / 2} textAnchor="middle" fontSize={9} fill="#64748b"
        transform={`rotate(-90, 10, ${MARGIN.top + PLOT_H / 2})`}>North (m)</text>

      {/* North indicator arrow */}
      <g>
        <line x1={MARGIN.left + PLOT_W - 12} y1={MARGIN.top + 20} x2={MARGIN.left + PLOT_W - 12} y2={MARGIN.top + 6}
          stroke="#22c55e" strokeWidth={2} markerEnd="url(#north-arrow)" />
        <text x={MARGIN.left + PLOT_W - 12} y={MARGIN.top + 30} textAnchor="middle" fontSize={9} fill="#22c55e">N</text>
        <defs>
          <marker id="north-arrow" markerWidth="6" markerHeight="6" refX="3" refY="6" orient="auto">
            <path d="M0,6 L3,0 L6,6" fill="#22c55e" />
          </marker>
        </defs>
      </g>

      {/* Path */}
      {points.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          clipPath="url(#ne-clip)"
        />
      )}

      {/* Start marker */}
      {start && (
        <circle cx={start.x} cy={start.y} r={5} fill="#22c55e" stroke="#0f172a" strokeWidth={1.5}
          clipPath="url(#ne-clip)" />
      )}

      {/* Current position marker */}
      {current && (
        <circle cx={current.x} cy={current.y} r={4} fill="#f59e0b" stroke="#0f172a" strokeWidth={1.5}
          clipPath="url(#ne-clip)" />
      )}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// 2. Altitude vs Time chart
// ────────────────────────────────────────────────────────────

/** Minimum Y-axis span (ft) — keeps level flight readable and prevents drift magnification */
const MIN_ALT_SPAN_FT = 500;

function AltTimePlot({ history }: { history: AircraftState[] }) {
  const { timeRange, altRange } = useMemo<{ timeRange: NiceRange; altRange: NiceRange }>(() => {
    if (history.length === 0) {
      return { timeRange: { lo: 0, hi: 60, step: 10 }, altRange: { lo: 4750, hi: 5250, step: 100 } };
    }
    const times = history.map((s) => s.time);
    const alts  = history.map((s) => s.altitudeFt);
    const tR    = niceRange(0, Math.max(60, ...times), 5);

    // Enforce a minimum span so a steady level flight doesn't produce a
    // degenerate single-value axis that magnifies floating-point drift.
    const altMin = Math.min(...alts);
    const altMax = Math.max(...alts);
    const center = (altMin + altMax) / 2;
    const span   = Math.max(altMax - altMin, MIN_ALT_SPAN_FT);
    const aR     = niceRange(center - span / 2, center + span / 2, 4);

    return { timeRange: tR, altRange: aR };
  }, [history]);

  const toSvg = (t: number, a: number) => ({
    x: MARGIN.left + linMap(t, timeRange.lo, timeRange.hi, 0, PLOT_W),
    y: MARGIN.top + linMap(a, altRange.hi, altRange.lo, 0, PLOT_H),
  });

  const polyline = useMemo(() => {
    if (history.length < 2) return '';
    return history.map((s) => {
      const { x, y } = toSvg(s.time, s.altitudeFt);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  function axisTicksT() {
    const tks: number[] = [];
    for (let v = timeRange.lo; v <= timeRange.hi + 1e-9; v += timeRange.step) tks.push(v);
    return tks;
  }
  function axisTicksA() {
    const tks: number[] = [];
    for (let v = altRange.lo; v <= altRange.hi + 1e-9; v += altRange.step) tks.push(v);
    return tks;
  }

  return (
    <svg width={SVG_W} height={SVG_H} style={{ background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }}>
      <text x={SVG_W / 2} y={14} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="sans-serif">
        Altitude vs Time
      </text>

      <clipPath id="alt-clip">
        <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} />
      </clipPath>

      {/* Axes */}
      <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + PLOT_H} stroke="#334155" strokeWidth={1} />
      <line x1={MARGIN.left} y1={MARGIN.top + PLOT_H} x2={MARGIN.left + PLOT_W} y2={MARGIN.top + PLOT_H} stroke="#334155" strokeWidth={1} />

      {/* Time ticks */}
      {axisTicksT().map((v, i) => {
        const x = MARGIN.left + linMap(v, timeRange.lo, timeRange.hi, 0, PLOT_W);
        return (
          <g key={i}>
            <line x1={x} y1={MARGIN.top + PLOT_H} x2={x} y2={MARGIN.top + PLOT_H + 4} stroke="#475569" strokeWidth={1} />
            <line x1={x} y1={MARGIN.top} x2={x} y2={MARGIN.top + PLOT_H} stroke="#1e293b" strokeWidth={1} strokeDasharray="3,4" />
            <text x={x} y={MARGIN.top + PLOT_H + 14} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="monospace">
              {v.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* Altitude ticks — format adapts to span: "xk" for large ranges, whole feet for small */}
      {axisTicksA().map((v, i) => {
        const y      = MARGIN.top + linMap(v, altRange.hi, altRange.lo, 0, PLOT_H);
        const span   = altRange.hi - altRange.lo;
        const label  = span >= 5000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
        return (
          <g key={i}>
            <line x1={MARGIN.left - 4} y1={y} x2={MARGIN.left} y2={y} stroke="#475569" strokeWidth={1} />
            <line x1={MARGIN.left} y1={y} x2={MARGIN.left + PLOT_W} y2={y} stroke="#1e293b" strokeWidth={1} strokeDasharray="3,4" />
            <text x={MARGIN.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize={8} fill="#64748b" fontFamily="monospace">
              {label}
            </text>
          </g>
        );
      })}

      {/* Labels */}
      <text x={MARGIN.left + PLOT_W / 2} y={SVG_H - 4} textAnchor="middle" fontSize={9} fill="#64748b">Time (s)</text>
      <text x={10} y={MARGIN.top + PLOT_H / 2} textAnchor="middle" fontSize={9} fill="#64748b"
        transform={`rotate(-90, 10, ${MARGIN.top + PLOT_H / 2})`}>Alt (ft)</text>

      {/* Line */}
      {history.length > 1 && (
        <polyline
          points={polyline}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={1.5}
          clipPath="url(#alt-clip)"
        />
      )}

      {/* Current point */}
      {history.length > 0 && (() => {
        const last = history[history.length - 1];
        const { x, y } = toSvg(last.time, last.altitudeFt);
        return <circle cx={x} cy={y} r={3} fill="#f59e0b" clipPath="url(#alt-clip)" />;
      })()}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────

interface FlightPathProps {
  history: AircraftState[];
}

export function FlightPath({ history }: FlightPathProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '12px 8px',
        background: '#0f172a',
        borderRadius: 8,
        border: '1px solid #1e293b',
      }}
    >
      <NEPath history={history} />
      <AltTimePlot history={history} />
    </div>
  );
}
