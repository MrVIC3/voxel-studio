import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './components';
export type EditorCommand = {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  enabled?: boolean;
  run: () => void;
};
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: EditorCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [index, setIndex] = useState(0);
  const search = useRef<HTMLInputElement>(null),
    list = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/);
    return commands.filter(
      (c) =>
        c.enabled !== false &&
        words.every((word) =>
          `${c.label} ${c.group} ${c.shortcut || ''}`.toLowerCase().includes(word),
        ),
    );
  }, [commands, query]);
  useEffect(() => {
    search.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const execute = (command: EditorCommand) => {
    onClose();
    command.run();
  };
  return (
    <Modal title="Command Search" onClose={onClose}>
      <div className="command-search">
        <Search size={16} />
        <input
          ref={search}
          aria-label="Search commands"
          placeholder="Search tools, actions, or shortcuts…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) =>
                Math.max(0, Math.min(results.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
              );
            }
            if (e.key === 'Enter' && results[index]) {
              e.preventDefault();
              execute(results[index]);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={results[index] ? `command-${results[index].id}` : undefined}
          autoComplete="off"
        />
      </div>
      <div className="command-results" id="command-results" role="listbox" ref={list}>
        {results.map((command, i) => (
          <button
            key={command.id}
            id={`command-${command.id}`}
            role="option"
            aria-selected={index === i}
            className={index === i ? 'selected' : ''}
            onMouseEnter={() => setIndex(i)}
            onClick={() => execute(command)}
          >
            <span>
              <small>{command.group}</small>
              {command.label}
            </span>
            <kbd>{command.shortcut || ''}</kbd>
          </button>
        ))}
        {!results.length && <p className="command-empty">No matching commands.</p>}
      </div>
      <footer className="command-footer">
        ↑ ↓ Navigate <span>Enter Run</span>
        <span>Esc Close</span>
      </footer>
    </Modal>
  );
}
