// ============================================================
// EventPanel.tsx — Event/maneuver configuration UI
// ============================================================

import React, { useState, useCallback } from 'react';
import { createLevelFlightEvent } from '../simulation/eventSystem';
import type { Simulator } from '../simulation/simulator';
import type { SimEvent, StateCondition, ControlAction, ThrottleAction } from '../models/types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function formatCondition(c: StateCondition): string {
  return `${c.property} ${c.operator} ${c.value}`;
}

function formatThrottleAction(t: ThrottleAction): string {
  if (t.type === 'trim')        return 'trim (level)';
  if (t.type === 'climb-trim')  return `trim (climb ${t.gammaDeg}°)`;
  if (t.type === 'fpa-follow')  return 'trim (fpa-follow)';
  return `${(t.value * 100).toFixed(0)}%`;
}

function formatNzbAction(n: NonNullable<ControlAction['nzb']>): string {
  if (n.type === 'trim')         return 'trim (cos α)';
  if (n.type === 'fpa-control')  return `FPA→${n.targetGammaDeg}° (kP=${n.kP})`;
  if (n.type === 'altitude-pid') return `Alt PID→${Math.round(n.targetAltitudeFt).toLocaleString()} ft`;
  return `${n.value.toFixed(3)}g`;
}

function formatAction(action: ControlAction): string {
  const parts: string[] = [];
  if (action.throttle !== undefined) {
    parts.push(`THR: ${formatThrottleAction(action.throttle)}`);
  }
  if (action.nzb !== undefined) {
    parts.push(`Nzb: ${formatNzbAction(action.nzb)}`);
  }
  if (action.bank !== undefined) {
    const bankDeg = (action.bank.value * 180) / Math.PI;
    parts.push(`Bank: ${bankDeg.toFixed(1)}°`);
  }
  return parts.length > 0 ? parts.join('  |  ') : '(no action)';
}

// ────────────────────────────────────────────────────────────
// Add-event form state
// ────────────────────────────────────────────────────────────

interface NewEventForm {
  name: string;
  priority: number;
  throttleType: 'constant' | 'trim';
  throttleValue: number;
  nzb: number;
  bankDeg: number;
  condProp: string;
  condOp: string;
  condVal: number;
  useCondition: boolean;
  oneShot: boolean;
}

const DEFAULT_FORM: NewEventForm = {
  name: 'New Maneuver',
  priority: 5,
  throttleType: 'constant',
  throttleValue: 0.75,
  nzb: 1.0,
  bankDeg: 0,
  condProp: 'altitudeFt',
  condOp: '>',
  condVal: 6000,
  useCondition: true,
  oneShot: false,
};

// ────────────────────────────────────────────────────────────
// EventRow component
// ────────────────────────────────────────────────────────────

interface EventRowProps {
  event: SimEvent;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function EventRow({ event, onToggle, onRemove }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: event.enabled ? '#1e293b' : '#0f172a',
        border: `1px solid ${event.enabled ? '#334155' : '#1e293b'}`,
        borderRadius: 6,
        marginBottom: 6,
        padding: '6px 10px',
        opacity: event.enabled ? 1 : 0.6,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Enable toggle */}
        <button
          onClick={() => onToggle(event.id)}
          title={event.enabled ? 'Disable' : 'Enable'}
          style={{
            width: 18,
            height: 18,
            borderRadius: 3,
            border: '1px solid #475569',
            background: event.enabled ? '#3b82f6' : '#1e293b',
            cursor: 'pointer',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {event.enabled && (
            <svg width={10} height={10} viewBox="0 0 10 10">
              <polyline points="1,5 4,8 9,2" fill="none" stroke="white" strokeWidth={1.8} />
            </svg>
          )}
        </button>

        {/* Name + priority */}
        <span
          style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 12, flex: 1, cursor: 'pointer' }}
          onClick={() => setExpanded((e) => !e)}
        >
          {event.name}
        </span>
        <span style={{ fontSize: 10, color: '#64748b', marginRight: 4 }}>P{event.priority}</span>
        {event.oneShot && (
          <span style={{ fontSize: 9, background: '#7c3aed', color: '#ede9fe', borderRadius: 3, padding: '1px 4px' }}>1-shot</span>
        )}
        {event.triggered && (
          <span style={{ fontSize: 9, background: '#166534', color: '#bbf7d0', borderRadius: 3, padding: '1px 4px' }}>fired</span>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: 12 }}
        >
          {expanded ? '▲' : '▼'}
        </button>

        {/* Remove */}
        <button
          onClick={() => onRemove(event.id)}
          title="Remove event"
          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155', fontSize: 11 }}>
          <div style={{ color: '#94a3b8', marginBottom: 3 }}>
            <span style={{ color: '#64748b' }}>Conditions: </span>
            {event.conditions.length === 0 ? (
              <em style={{ color: '#64748b' }}>Always active</em>
            ) : (
              event.conditions.map((c, i) => (
                <span key={i} style={{ marginRight: 8, background: '#334155', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace' }}>
                  {formatCondition(c)}
                </span>
              ))
            )}
          </div>
          <div style={{ color: '#94a3b8' }}>
            <span style={{ color: '#64748b' }}>Actions: </span>
            <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{formatAction(event.action)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Add-event form
// ────────────────────────────────────────────────────────────

interface AddEventFormProps {
  onAdd: (event: SimEvent) => void;
  onCancel: () => void;
}

function AddEventForm({ onAdd, onCancel }: AddEventFormProps) {
  const [form, setForm] = useState<NewEventForm>(DEFAULT_FORM);

  const set = <K extends keyof NewEventForm>(key: K, value: NewEventForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    const conditions: StateCondition[] = form.useCondition
      ? [{ property: form.condProp as StateCondition['property'], operator: form.condOp as StateCondition['operator'], value: form.condVal }]
      : [];

    const action: ControlAction = {
      throttle: form.throttleType === 'trim'
        ? { type: 'trim' }
        : { type: 'constant', value: Math.max(0, Math.min(1, form.throttleValue)) },
      nzb: { type: 'constant', value: form.nzb },
      bank: { type: 'constant', value: (form.bankDeg * Math.PI) / 180 },
    };

    const event: SimEvent = {
      id: `event-${Date.now()}`,
      name: form.name || 'Unnamed Maneuver',
      enabled: true,
      priority: form.priority,
      conditions,
      action,
      oneShot: form.oneShot,
      triggered: false,
    };

    onAdd(event);
  };

  const inputStyle: React.CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 4,
    color: '#e2e8f0',
    padding: '3px 6px',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
    display: 'block',
  };

  const rowStyle: React.CSSProperties = {
    marginBottom: 8,
  };

  const COND_PROPS = ['altitude','altitudeFt','airspeed','airspeedKts','mach','flightPathAngle','heading','climbRate','climbRateFpm','alpha','time'];
  const COND_OPS = ['>','<','>=','<=','==','!='];

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0', marginBottom: 10 }}>Add New Event</div>

      <div style={rowStyle}>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, ...rowStyle }}>
          <label style={labelStyle}>Priority</label>
          <input style={inputStyle} type="number" value={form.priority}
            onChange={(e) => set('priority', parseInt(e.target.value) || 1)} />
        </div>
        <div style={{ flex: 1, ...rowStyle, display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.oneShot} onChange={(e) => set('oneShot', e.target.checked)} />
            One-shot
          </label>
        </div>
      </div>

      {/* Throttle */}
      <div style={rowStyle}>
        <label style={labelStyle}>Throttle</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={{ ...inputStyle, width: 'auto' }} value={form.throttleType}
            onChange={(e) => set('throttleType', e.target.value as 'constant' | 'trim')}>
            <option value="trim">Trim (auto)</option>
            <option value="constant">Constant</option>
          </select>
          {form.throttleType === 'constant' && (
            <input style={inputStyle} type="number" min={0} max={1} step={0.05}
              value={form.throttleValue}
              onChange={(e) => set('throttleValue', parseFloat(e.target.value) || 0)} />
          )}
        </div>
      </div>

      {/* Nzb + Bank */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, ...rowStyle }}>
          <label style={labelStyle}>Load Factor (nzb)</label>
          <input style={inputStyle} type="number" step={0.1} value={form.nzb}
            onChange={(e) => set('nzb', parseFloat(e.target.value) || 1)} />
        </div>
        <div style={{ flex: 1, ...rowStyle }}>
          <label style={labelStyle}>Bank (°)</label>
          <input style={inputStyle} type="number" step={5} value={form.bankDeg}
            onChange={(e) => set('bankDeg', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {/* Condition */}
      <div style={rowStyle}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.useCondition} onChange={(e) => set('useCondition', e.target.checked)} />
          Add trigger condition
        </label>
        {form.useCondition && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <select style={{ ...inputStyle, flex: 2 }} value={form.condProp}
              onChange={(e) => set('condProp', e.target.value)}>
              {COND_PROPS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select style={{ ...inputStyle, flex: 1 }} value={form.condOp}
              onChange={(e) => set('condOp', e.target.value)}>
              {COND_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input style={{ ...inputStyle, flex: 1 }} type="number" value={form.condVal}
              onChange={(e) => set('condVal', parseFloat(e.target.value) || 0)} />
          </div>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={handleSubmit}
          style={{ flex: 1, padding: '5px 12px', background: '#3b82f6', border: 'none', borderRadius: 5,
            color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Add Event
        </button>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '5px 12px', background: '#334155', border: 'none', borderRadius: 5,
            color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main EventPanel
// ────────────────────────────────────────────────────────────

interface EventPanelProps {
  simulator: Simulator | null;
}

export function EventPanel({ simulator }: EventPanelProps) {
  const [, forceUpdate] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(() => forceUpdate((n) => n + 1), []);

  const events: SimEvent[] = simulator?.eventSystem.events ?? [];

  const handleToggle = useCallback((id: string) => {
    if (!simulator) return;
    const ev = simulator.eventSystem.events.find((e) => e.id === id);
    if (ev) {
      ev.enabled = !ev.enabled;
      refresh();
    }
  }, [simulator, refresh]);

  const handleRemove = useCallback((id: string) => {
    if (!simulator) return;
    simulator.eventSystem.removeEvent(id);
    refresh();
  }, [simulator, refresh]);

  const handleAddLevelFlight = useCallback(() => {
    if (!simulator) return;
    simulator.eventSystem.addEvent(createLevelFlightEvent());
    refresh();
  }, [simulator, refresh]);

  const handleClearAll = useCallback(() => {
    if (!simulator) return;
    simulator.eventSystem.events = [];
    refresh();
  }, [simulator, refresh]);

  const handleAddEvent = useCallback((event: SimEvent) => {
    if (!simulator) return;
    simulator.eventSystem.addEvent(event);
    setShowForm(false);
    refresh();
  }, [simulator, refresh]);

  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 320,
        flex: 1,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8',
          textTransform: 'uppercase', flex: 1 }}>
          Event System ({events.length})
        </div>
        <button onClick={handleAddLevelFlight}
          style={{ padding: '3px 8px', background: '#065f46', border: '1px solid #059669',
            borderRadius: 4, color: '#6ee7b7', fontSize: 11, cursor: 'pointer' }}>
          + Level Flight
        </button>
        <button onClick={() => setShowForm((s) => !s)}
          style={{ padding: '3px 8px', background: '#1e3a5f', border: '1px solid #3b82f6',
            borderRadius: 4, color: '#93c5fd', fontSize: 11, cursor: 'pointer' }}>
          + Custom
        </button>
        <button onClick={handleClearAll}
          style={{ padding: '3px 8px', background: '#450a0a', border: '1px solid #dc2626',
            borderRadius: 4, color: '#fca5a5', fontSize: 11, cursor: 'pointer' }}>
          Clear All
        </button>
      </div>

      {/* Event list */}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
            No events — add one above
          </div>
        ) : (
          [...events]
            .sort((a, b) => b.priority - a.priority)
            .map((ev) => (
              <EventRow key={ev.id} event={ev} onToggle={handleToggle} onRemove={handleRemove} />
            ))
        )}
      </div>

      {/* Add event form */}
      {showForm && (
        <AddEventForm onAdd={handleAddEvent} onCancel={() => setShowForm(false)} />
      )}
    </div>
  );
}
