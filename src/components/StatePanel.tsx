// ============================================================
// StatePanel.tsx — Raw state readout table
// ============================================================

import type { AircraftState } from '../models/types';

interface StatePanelProps {
  state: AircraftState | null;
}

interface RowData {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function buildRows(state: AircraftState): RowData[] {
  const headingDeg = ((state.heading * 180) / Math.PI + 360) % 360;
  const fpaDeg = (state.flightPathAngle * 180) / Math.PI;
  const alphaDeg = (state.alpha * 180) / Math.PI;
  const bankDeg = (state.bank * 180) / Math.PI;

  return [
    { label: 'Time',        value: fmt(state.time, 1),            unit: 's' },
    { label: 'Altitude',    value: Math.round(state.altitudeFt).toLocaleString(), unit: 'ft',  highlight: true },
    { label: 'Airspeed',    value: fmt(state.airspeedKts, 1),     unit: 'kts', highlight: true },
    { label: 'Mach',        value: fmt(state.mach, 4),            unit: '' },
    { label: 'Heading',     value: fmt(headingDeg, 1),            unit: '°',   highlight: true },
    { label: 'FPA',         value: fmt(fpaDeg, 2),                unit: '°' },
    { label: 'Climb Rate',  value: Math.round(state.climbRateFpm).toLocaleString(), unit: 'fpm' },
    { label: 'Alpha',       value: fmt(alphaDeg, 2),              unit: '°' },
    { label: 'Throttle',    value: fmt(state.throttle * 100, 1),  unit: '%' },
    { label: 'Nzb',         value: fmt(state.nzb, 3),             unit: 'g' },
    { label: 'Bank',        value: fmt(bankDeg, 1),               unit: '°' },
    { label: 'Alt (m)',     value: fmt(state.altitude, 1),        unit: 'm' },
    { label: 'North',       value: fmt(state.north, 1),           unit: 'm' },
    { label: 'East',        value: fmt(state.east, 1),            unit: 'm' },
  ];
}

export function StatePanel({ state }: StatePanelProps) {
  const rows: RowData[] = state ? buildRows(state) : [];

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#94a3b8',
          textTransform: 'uppercase',
          marginBottom: 8,
          borderBottom: '1px solid #1e293b',
          paddingBottom: 4,
        }}
      >
        Aircraft State
      </div>

      {state === null ? (
        <div style={{ color: '#64748b', fontSize: 12 }}>No data</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td
                  style={{
                    color: '#64748b',
                    paddingRight: 8,
                    paddingTop: 3,
                    paddingBottom: 3,
                    whiteSpace: 'nowrap',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {row.label}
                </td>
                <td
                  style={{
                    color: row.highlight ? '#e2e8f0' : '#94a3b8',
                    fontFamily: 'monospace',
                    textAlign: 'right',
                    paddingTop: 3,
                    paddingBottom: 3,
                    fontWeight: row.highlight ? 600 : 400,
                    paddingRight: 4,
                  }}
                >
                  {row.value}
                </td>
                <td
                  style={{
                    color: '#475569',
                    fontFamily: 'sans-serif',
                    fontSize: 11,
                    paddingTop: 3,
                    paddingBottom: 3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
