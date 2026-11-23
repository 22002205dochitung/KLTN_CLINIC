import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CalendarPicker.css';

const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYMD = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** "Thứ tư, 12/11/2026" */
export const formatVietnameseDate = (ymd) => {
  if (!ymd) return '';
  const d = fromYMD(ymd);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * CalendarPicker - date field that opens a month calendar (Monday first, Vietnamese labels).
 * The calendar closes after a day is picked, on Escape, or on a click outside.
 *
 * Props:
 *  value        'YYYY-MM-DD' or ''
 *  onChange     (ymd) => void
 *  min, max     'YYYY-MM-DD' bounds (inclusive); dates outside are disabled
 *  id           id of the field button, so a <label htmlFor> can point at it
 *  placeholder  text shown while no date is chosen
 *  disabledWeekdays  weekday numbers (0 = Sunday) the clinic is closed
 *  disabledDates     'YYYY-MM-DD' days off (e.g. the doctor's leave)
 */
const CalendarPicker = ({ value, onChange, min, max, id, placeholder = 'Chọn ngày', disabledWeekdays = [], disabledDates = [] }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        if (fieldRef.current) fieldRef.current.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // the month opens below the field; scroll the page so the whole month (incl. the last week) is visible
  const popRef = useRef(null);
  useEffect(() => {
    if (open && popRef.current && popRef.current.scrollIntoView) {
      popRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open]);

  const pick = (ymd) => {
    onChange(ymd);
    setOpen(false);
    if (fieldRef.current) fieldRef.current.focus();
  };

  return (
    <div className="calp-wrap" ref={wrapRef}>
      <button
        type="button"
        id={id}
        ref={fieldRef}
        className={`calp-field ${open ? 'is-open' : ''} ${value ? '' : 'is-empty'}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="calp-field-icon" aria-hidden="true">📅</span>
        <span className="calp-field-text">{value ? formatVietnameseDate(value) : placeholder}</span>
        <span className="calp-field-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="calp-popover" role="dialog" aria-label="Chọn ngày" ref={popRef}>
          <MonthCalendar value={value} onChange={pick} min={min} max={max} disabledWeekdays={disabledWeekdays} disabledDates={disabledDates} />
        </div>
      )}
    </div>
  );
};

/** The month grid itself */
const MonthCalendar = ({ value, onChange, min, max, disabledWeekdays = [], disabledDates = [] }) => {
  const today = toYMD(new Date());
  const initial = value ? fromYMD(value) : (min ? fromYMD(min) : new Date());
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < offset; i++) list.push(null);
    for (let day = 1; day <= daysInMonth; day++) list.push(toYMD(new Date(view.year, view.month, day)));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [view]);

  const monthStart = toYMD(new Date(view.year, view.month, 1));
  const monthEnd = toYMD(new Date(view.year, view.month + 1, 0));
  const canPrev = !min || monthStart > min;
  const canNext = !max || monthEnd < max;

  const shift = (delta) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // 'closed' (clinic weekday) and 'leave' (doctor's day off) are shown differently from out-of-range days
  const offReason = (ymd) => {
    if (disabledWeekdays.includes(fromYMD(ymd).getDay())) return 'closed';
    if (disabledDates.includes(ymd)) return 'leave';
    return null;
  };
  const isDisabled = (ymd) => (min && ymd < min) || (max && ymd > max) || !!offReason(ymd);
  const hasOffDays = disabledWeekdays.length > 0 || disabledDates.length > 0;

  return (
    <div className="calp">
      <div className="calp-head">
        <button type="button" className="calp-nav" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Tháng trước">‹</button>
        <div className="calp-title" aria-live="polite">Tháng {view.month + 1}, {view.year}</div>
        <button type="button" className="calp-nav" onClick={() => shift(1)} disabled={!canNext} aria-label="Tháng sau">›</button>
      </div>

      <div className="calp-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`calp-weekday ${i === 6 ? 'is-sunday' : ''}`}>{w}</div>
        ))}
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`blank-${i}`} className="calp-blank" />;
          const disabled = isDisabled(ymd);
          const off = offReason(ymd);
          const selected = ymd === value;
          const classes = [
            'calp-day',
            selected && 'is-selected',
            ymd === today && 'is-today',
            i % 7 === 6 && 'is-sunday',
            disabled && 'is-disabled',
            off && 'is-off'
          ].filter(Boolean).join(' ');
          const offTitle = off === 'closed' ? 'Phòng khám nghỉ' : off === 'leave' ? 'Bác sĩ nghỉ' : undefined;
          return (
            <button
              key={ymd}
              type="button"
              className={classes}
              disabled={disabled}
              onClick={() => onChange(ymd)}
              aria-pressed={selected}
              aria-label={offTitle ? `${formatVietnameseDate(ymd)} – ${offTitle}` : formatVietnameseDate(ymd)}
              title={offTitle}
            >
              {Number(ymd.slice(8))}
            </button>
          );
        })}
      </div>

      <div className="calp-foot">
        <span><i className="calp-swatch is-today" /> Hôm nay</span>
        <span><i className="calp-swatch is-selected" /> Ngày đã chọn</span>
        {hasOffDays && <span><i className="calp-swatch is-off" /> Nghỉ</span>}
        {!isDisabled(today) && today !== value && (
          <button type="button" className="calp-today-btn" onClick={() => {
            const t = new Date();
            setView({ year: t.getFullYear(), month: t.getMonth() });
            onChange(today);
          }}>
            Chọn hôm nay
          </button>
        )}
      </div>
    </div>
  );
};

export default CalendarPicker;
