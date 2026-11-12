import { useEffect, useRef, useState } from 'react';
import type { ReactNode, ComponentType } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { Vec3 } from './model';
import { parseNumber } from './numbers';
export type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  className = '',
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''} ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} strokeWidth={1.65} />
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled):not([hidden]),select,textarea,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    ref.current?.focus();
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </header>
        {children}
      </div>
    </div>
  );
}
export function NumberField({
  value,
  onCommit,
  min = -1e6,
  max = 1e6,
  step = 0.1,
  label,
  className = '',
}: {
  value: number;
  onCommit: (n: number) => unknown;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  const ref = useRef<HTMLInputElement>(null);
  const cancelBlur = useRef(false);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(Number(value.toFixed(3))));
  }, [value]);
  const commit = () => {
    if (cancelBlur.current) {
      cancelBlur.current = false;
      return;
    }
    const n = parseNumber(draft);
    if (n !== null) {
      const clamped = Math.min(max, Math.max(min, n));
      const accepted = Math.abs(clamped - value) <= 1e-10 || onCommit(clamped) !== false;
      setDraft(String(Number((accepted ? clamped : value).toFixed(3))));
    } else setDraft(String(Number(value.toFixed(3))));
  };
  return (
    <input
      ref={ref}
      className={`number-field ${className}`}
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
      title={`${label} · arithmetic such as 90/2 · ↑↓ adjust · Shift for larger steps, Alt for precision`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const amount =
            step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const next = Math.min(
            max,
            Math.max(min, Number(((parseNumber(draft) ?? value) + amount).toPrecision(12))),
          );
          const accepted = next === value || onCommit(next) !== false;
          setDraft(String(accepted ? next : value));
        }
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelBlur.current = true;
          setDraft(String(Number(value.toFixed(3))));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
export function VectorField({
  label,
  value,
  onCommit,
  rotation = false,
  scale = false,
}: {
  label: string;
  value: Vec3;
  onCommit: (v: Vec3) => void;
  rotation?: boolean;
  scale?: boolean;
}) {
  return (
    <div className="vector-field">
      <label>
        {label}
        {rotation && <span>degrees</span>}
      </label>
      <div className="vector-inputs">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <div key={axis} className={`axis-field axis-${axis.toLowerCase()}`}>
            <span>{axis}</span>
            <NumberField
              label={`${label} ${axis}`}
              value={rotation ? (value[i] * 180) / Math.PI : value[i]}
              min={scale ? 0.01 : -100000}
              max={scale ? 100 : 100000}
              step={rotation ? 1 : 0.1}
              onCommit={(n) => {
                const next = [...value] as Vec3;
                next[i] = rotation ? (n * Math.PI) / 180 : n;
                onCommit(next);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onPreview,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  onPreview?: (n: number) => void;
  suffix?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="slider-field">
      <span>
        {label}
        <output>
          {Number(v.toFixed(2))}
          {suffix}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          setV(n);
          onPreview?.(n);
        }}
        onPointerUp={() => onChange(v)}
        onKeyUp={() => onChange(v)}
      />
    </label>
  );
}
export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="property-section">
      <div className="section-title">
        <button
          className="section-collapse"
          aria-label={`Toggle ${title} section`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronDown size={13} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }} />
          <h3>{title}</h3>
        </button>
        {aside}
      </div>
      {!collapsed && children}
    </section>
  );
}
