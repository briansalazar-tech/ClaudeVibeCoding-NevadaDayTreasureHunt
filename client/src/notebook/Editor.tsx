import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNotebook } from './context';
import {
  completeLink,
  continueBullet,
  indentLines,
  linkQueryAt,
  suggestLinks,
  type Edit,
  type Suggestion,
} from './editing';

interface EditorProps {
  value: string;
  onChange: (text: string) => void;
  onDone?: () => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
}

/**
 * A Markdown textarea with outliner keys (Tab/Shift+Tab indent, Enter continues a bullet) and
 * `[[` suggestions from pages and map places.
 */
export function Editor({
  value,
  onChange,
  onDone,
  label,
  placeholder,
  autoFocus,
  rows = 10,
}: EditorProps) {
  const { pages, names } = useNotebook();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [link, setLink] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const pendingSelection = useRef<[number, number] | null>(null);

  const suggestions: Suggestion[] = link ? suggestLinks(link.query, pages, names) : [];

  // Put the caret back where an edit left it, once React has re-rendered the new text.
  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    if (sel && ref.current) {
      ref.current.setSelectionRange(sel[0], sel[1]);
      pendingSelection.current = null;
    }
  });

  const apply = (edit: Edit) => {
    pendingSelection.current = [edit.start, edit.end];
    onChange(edit.text);
    updateLink(edit.text, edit.end);
  };

  const updateLink = (text: string, caret: number) => {
    const next = linkQueryAt(text, caret);
    setLink(next);
    if (next?.query !== link?.query) setActive(0);
  };

  const pick = (s: Suggestion) => {
    const el = ref.current;
    if (!el || !link) return;
    apply(completeLink(value, link.start, el.selectionStart, s.title));
    setLink(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setLink(null);
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      apply(indentLines(value, el.selectionStart, el.selectionEnd, e.shiftKey));
    } else if (e.key === 'Enter' && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      const edit = continueBullet(value, el.selectionStart);
      if (edit) {
        e.preventDefault();
        apply(edit);
      }
    } else if (e.key === 'Escape' && onDone) {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  };

  return (
    <div className="nb-editor">
      <textarea
        ref={ref}
        className="text-input nb-textarea"
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck
        onChange={(e) => {
          onChange(e.target.value);
          updateLink(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => updateLink(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setLink(null), 150)}
      />
      {suggestions.length > 0 && (
        <ul className="nb-suggest" role="listbox" aria-label="Link suggestions">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}|${s.title}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                // Keep the textarea's focus (and caret) while picking.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                <span>{s.title}</span>
                <span className="muted">{s.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
