"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export type MentionMember = {
  id: string;
  name: string | null;
  email: string;
};

function memberLabel(member: MentionMember) {
  return member.name?.trim() || member.email;
}

/** Active `@query` immediately before the caret. */
export function activeMentionQuery(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = before.match(/@([^\s@]*)$/);
  if (!match) return null;
  return { start: caret - match[0].length, query: match[1] ?? "" };
}

export function filterMentionMembers(
  members: MentionMember[],
  query: string,
): MentionMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members.slice(0, 8);
  return members
    .filter((member) => {
      const name = member.name?.toLowerCase() ?? "";
      const email = member.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    })
    .slice(0, 8);
}

export function insertMention(
  value: string,
  caret: number,
  start: number,
  member: MentionMember,
): { next: string; caret: number } {
  const token = `@${member.email}`;
  const after = value.slice(caret);
  const needsSpace = after.length === 0 || !/^\s/.test(after);
  const inserted = `${token}${needsSpace ? " " : ""}`;
  const next = `${value.slice(0, start)}${inserted}${after}`;
  return { next, caret: start + inserted.length };
}

export function MentionComposer({
  value,
  onChange,
  members = [],
  rows = 2,
  pending = false,
  onSubmit,
  onPaste,
  "aria-label": ariaLabel = "Add a comment",
  placeholder = "Add a comment — type @ to mention · ⌘/Ctrl+Enter to submit",
  className = "min-w-[12rem] flex-1 resize-y rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm",
}: {
  value: string;
  onChange: (value: string) => void;
  members?: MentionMember[];
  rows?: number;
  pending?: boolean;
  onSubmit?: () => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  "aria-label"?: string;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const mention = useMemo(
    () => activeMentionQuery(value, caret),
    [value, caret],
  );
  const suggestions = useMemo(
    () => (mention ? filterMentionMembers(members, mention.query) : []),
    [mention, members],
  );
  const showMenu = menuOpen && Boolean(mention) && suggestions.length > 0;

  const syncCaret = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setCaret(el.selectionStart ?? 0);
  }, []);

  const applyMember = useCallback(
    (member: MentionMember) => {
      if (!mention) return;
      const { next, caret: nextCaret } = insertMention(
        value,
        caret,
        mention.start,
        member,
      );
      onChange(next);
      setMenuOpen(false);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
        setCaret(nextCaret);
      });
    },
    [mention, value, caret, onChange],
  );

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const member = suggestions[activeIndex];
        if (member) applyMember(member);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!pending && value.trim() && onSubmit) onSubmit();
    }
  }

  return (
    <div className="relative min-w-[12rem] flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        aria-label={ariaLabel}
        aria-autocomplete={members.length ? "list" : undefined}
        aria-expanded={showMenu || undefined}
        aria-controls={showMenu ? "mention-suggestions" : undefined}
        placeholder={
          members.length
            ? placeholder
            : placeholder.replace(" — type @ to mention", "")
        }
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setMenuOpen(true);
          setActiveIndex(0);
        }}
        onClick={syncCaret}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          // Delay so suggestion button clicks register.
          window.setTimeout(() => setMenuOpen(false), 120);
        }}
      />
      {showMenu ? (
        <ul
          id="mention-suggestions"
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute z-20 mt-1 max-h-48 w-full min-w-[14rem] overflow-auto rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] py-1 shadow-sm"
        >
          {suggestions.map((member, index) => (
            <li key={member.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs ${
                  index === activeIndex
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-chip)]/60"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMember(member);
                }}
              >
                <span className="font-medium">{memberLabel(member)}</span>
                <span className="font-mono text-[color:var(--topo-muted)]">
                  @{member.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {members.length > 0 ? (
        <p className="mt-1 text-[10px] text-[color:var(--topo-muted)]">
          Mention teammates with @name or @email
        </p>
      ) : null}
    </div>
  );
}
