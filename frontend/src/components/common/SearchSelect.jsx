import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SearchSelect.css';

// "Tai mũi họng" matches "tai mui hong", "TMH" does not need accents
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * SearchSelect - ô chọn có gõ để tìm (combobox).
 * options: [{ value, label, hint? }]  ·  onChange(value)  ·  value: selected value ('' = none)
 * Keyboard: ↑/↓ chọn, Enter xác nhận, Esc đóng. Tìm không phân biệt dấu.
 */
const SearchSelect = ({ id, value, options, onChange, placeholder = 'Chọn…', emptyText = 'Không tìm thấy kết quả', required = false, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value)) || null;

  const filtered = useMemo(() => {
    const q = fold(query).trim();
    if (!q) return options;
    const words = q.split(/\s+/);
    return options.filter((o) => {
      const text = fold(`${o.label} ${o.hint || ''}`);
      return words.every((w) => text.includes(w));
    });
  }, [options, query]);

  // close when clicking outside
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  // keep the highlighted row visible
  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const idx = options.findIndex((o) => String(o.value) === String(value));
    setActive(idx >= 0 ? idx : 0);
  };

  const close = () => { setOpen(false); setQuery(''); };

  const pick = (opt) => {
    onChange(String(opt.value));
    close();
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); openList(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  };

  const listId = `${id}-list`;

  return (
    <div className={`sx ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`} ref={wrapRef}>
      <span className="sx-icon" aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        className="sx-input"
        placeholder={selected && open ? selected.label : placeholder}
        value={open ? query : (selected ? selected.label : '')}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        required={required && !selected}
      />
      <span className="sx-caret" aria-hidden="true">▾</span>

      {open && (
        <ul className="sx-list" id={listId} role="listbox" ref={listRef}>
          {filtered.length === 0 && <li className="sx-empty">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={String(o.value) === String(value)}
              className={`sx-opt ${i === active ? 'is-active' : ''} ${String(o.value) === String(value) ? 'is-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="sx-label">{o.label}</span>
              {o.hint && <small className="sx-hint">{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchSelect;
