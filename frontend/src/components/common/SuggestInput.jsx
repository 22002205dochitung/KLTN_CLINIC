import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SearchSelect.css';
import './SuggestInput.css';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const SEP = '; ';

/** Text after the last ";" = what the user is typing now (used to filter the list) */
const lastPart = (text) => {
  const i = String(text || '').lastIndexOf(';');
  return (i >= 0 ? text.slice(i + 1) : String(text || '')).trim();
};

/**
 * SuggestInput – free text with a dropdown of ready-made phrases.
 *  - click / focus (or ▾) opens the list, typing filters it (no accents needed)
 *  - picking a phrase fills the box; picking another one adds it after "; "
 *  - anything can still be typed by hand
 * options: [{ label, group? }]
 */
const SuggestInput = ({ id, value, onChange, options, placeholder, disabled = false, rows = 2 }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const text = String(value || '');

  const chosen = useMemo(
    () => new Set(text.split(';').map((s) => fold(s).trim()).filter(Boolean)),
    [text]
  );

  const filtered = useMemo(() => {
    const q = fold(lastPart(text));
    const base = options.filter((o) => !chosen.has(fold(o.label).trim()));
    // the box already ends with a whole phrase: show everything that can still be added
    if (!q || options.some((o) => fold(o.label) === q)) return base;
    const words = q.split(/\s+/);
    return base.filter((o) => words.every((w) => fold(`${o.label} ${o.group || ''}`).includes(w)));
  }, [options, text, chosen]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { setActive(-1); }, [text, open]);

  useEffect(() => {
    const el = active >= 0 ? listRef.current?.children[active] : null;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (opt) => {
    const q = fold(lastPart(text));
    const typedPart = q && !options.some((o) => fold(o.label) === q); // a filter word, not a phrase
    let base = text;
    if (typedPart) {
      const i = text.lastIndexOf(';');
      base = i >= 0 ? text.slice(0, i) : '';
    }
    base = base.replace(/[;\s]+$/, '');
    onChange(base ? `${base}${SEP}${opt.label}` : opt.label);
    boxRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      pick(filtered[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const listId = `${id}-list`;
  let lastGroup = null;

  return (
    <div className={`sxi ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <textarea
        ref={boxRef}
        id={id}
        className="form-control sxi-box"
        rows={rows}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
      />
      <button
        type="button"
        className="sxi-toggle"
        tabIndex={-1}
        aria-label={open ? 'Đóng danh sách gợi ý' : 'Mở danh sách gợi ý'}
        onMouseDown={(e) => { e.preventDefault(); if (!disabled) { setOpen((o) => !o); boxRef.current?.focus(); } }}
        disabled={disabled}
      >
        ▾
      </button>
      {text && !disabled && (
        <button
          type="button"
          className="sxi-clear"
          tabIndex={-1}
          aria-label="Xoá nội dung"
          onMouseDown={(e) => { e.preventDefault(); onChange(''); boxRef.current?.focus(); setOpen(true); }}
        >
          ×
        </button>
      )}

      {open && !disabled && (
        <ul className="sx-list sxi-list" id={listId} role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <li className="sx-empty">Không có gợi ý – cứ gõ nội dung riêng</li>
          ) : filtered.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group || lastGroup;
            return (
              <li
                key={o.label}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`sx-opt ${i === active ? 'is-active' : ''}`}
                data-group={head || undefined}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="sx-label">{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SuggestInput;
