'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Room, DiceSet, DiceType } from '@/lib/types';
import {
  GENERIC_PRESETS,
  RPG_PRESETS,
  loadCustomPresets,
  saveCustomPreset,
  deleteCustomPreset,
  type PresetSet,
  type CustomPreset,
} from '@/lib/presets';

export interface HostPanelProps {
  room: Room;
  isHost: boolean;
  onLockToggle: () => void;
  onKickPlayer: (playerId: string) => void;
  onClearHistory: () => void;
  onUpdateSets: (sets: DiceSet[]) => void;
}

const DICE_TYPES: DiceType[] = ['D4', 'D6', 'D8', 'D10', 'D10X', 'D12', 'D20'];

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function LockIcon({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border-fantasy/40 bg-bg-light/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronIcon open={open} />
        <span className="font-heading text-xs font-semibold uppercase tracking-wider text-primary">
          {title}
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dice Set Editor (inline form)
// ---------------------------------------------------------------------------

interface DiceSetDraft {
  name: string;
  dice: { type: DiceType; count: number }[];
}

function DiceSetEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: DiceSetDraft;
  onSave: (draft: DiceSetDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [dice, setDice] = useState<{ type: DiceType; count: number }[]>(
    initial?.dice ?? [{ type: 'D6', count: 1 }],
  );

  const updateDie = (index: number, field: 'type' | 'count', value: string | number) => {
    setDice((prev) =>
      prev.map((d, i) =>
        i === index
          ? {
              ...d,
              [field]: field === 'count' ? Math.max(1, Number(value)) : value,
            }
          : d,
      ),
    );
  };

  const addDie = () => setDice((prev) => [...prev, { type: 'D6', count: 1 }]);

  const removeDie = (index: number) => {
    if (dice.length <= 1) return;
    setDice((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), dice });
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-primary/30 bg-bg/60 p-3">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs text-text-muted">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Angriff"
          className="w-full rounded-md border border-border-fantasy/40 bg-bg-light px-2.5 py-1.5 text-sm text-text placeholder:text-text-muted/50 focus:border-primary focus:outline-none"
        />
      </div>

      {/* Dice rows */}
      <div className="space-y-2">
        <label className="block text-xs text-text-muted">Würfel</label>
        {dice.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={99}
              value={d.count}
              onChange={(e) => updateDie(i, 'count', e.target.value)}
              className="w-16 rounded-md border border-border-fantasy/40 bg-bg-light px-2 py-1.5 text-center text-sm text-text focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-text-muted">x</span>
            <select
              value={d.type}
              onChange={(e) => updateDie(i, 'type', e.target.value)}
              className="flex-1 rounded-md border border-border-fantasy/40 bg-bg-light px-2 py-1.5 text-sm text-text focus:border-primary focus:outline-none"
            >
              {DICE_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeDie(i)}
              disabled={dice.length <= 1}
              className="rounded p-1 text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-30"
              title="Würfel entfernen"
            >
              <TrashIcon />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addDie}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary-light"
        >
          <PlusIcon />
          Würfel hinzufügen
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="rounded-md bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary-light transition-colors hover:bg-primary/30 disabled:opacity-40"
        >
          Speichern
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HostPanel
// ---------------------------------------------------------------------------

export default function HostPanel({
  room,
  isHost,
  onLockToggle,
  onKickPlayer,
  onClearHistory,
  onUpdateSets,
}: HostPanelProps) {
  // Confirmation states
  const [clearConfirm, setClearConfirm] = useState(false);
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dice set editor state
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [creatingSet, setCreatingSet] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [savePresetName, setSavePresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Load custom presets on mount
  useEffect(() => {
    setCustomPresets(loadCustomPresets());
  }, []);

  // Section collapse state
  // (Section component handles its own state, but we expose editing triggers here)

  const handleCopyCode = useCallback(async () => {
    const link = `${window.location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      try {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Last resort: prompt user
        window.prompt('Link kopieren:', link);
      }
    }
  }, [room.code]);

  const handleClearHistory = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true);
      setTimeout(() => setClearConfirm(false), 3000);
      return;
    }
    onClearHistory();
    setClearConfirm(false);
  }, [clearConfirm, onClearHistory]);

  const handleKick = useCallback(
    (playerId: string) => {
      if (kickConfirm !== playerId) {
        setKickConfirm(playerId);
        setTimeout(() => setKickConfirm(null), 3000);
        return;
      }
      onKickPlayer(playerId);
      setKickConfirm(null);
    },
    [kickConfirm, onKickPlayer],
  );

  const handleSaveSet = useCallback(
    (draft: DiceSetDraft, existingId?: string) => {
      let updatedSets: DiceSet[];

      if (existingId) {
        // Editing existing set
        updatedSets = room.sets.map((s) =>
          s.id === existingId ? { ...s, name: draft.name, dice: draft.dice } : s,
        );
      } else {
        // Creating new set
        const newSet: DiceSet = {
          id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: draft.name,
          dice: draft.dice,
        };
        updatedSets = [...room.sets, newSet];
      }

      onUpdateSets(updatedSets);
      setEditingSetId(null);
      setCreatingSet(false);
    },
    [room.sets, onUpdateSets],
  );

  // Close preset menu on outside click
  useEffect(() => {
    if (!presetMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [presetMenuOpen]);

  const handleSaveAsPreset = useCallback(() => {
    if (!savePresetName.trim() || room.sets.length === 0) return;
    const setsDesc = room.sets.map((s) => s.name).join(', ');
    const preset: CustomPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: savePresetName.trim(),
      description: `${room.sets.length} Sets: ${setsDesc}`,
      sets: room.sets.map((s) => ({ name: s.name, dice: s.dice })),
      createdAt: Date.now(),
    };
    saveCustomPreset(preset);
    setCustomPresets(loadCustomPresets());
    setSavePresetName('');
    setShowSavePreset(false);
  }, [savePresetName, room.sets]);

  const handleDeleteCustomPreset = useCallback((id: string) => {
    deleteCustomPreset(id);
    setCustomPresets(loadCustomPresets());
  }, []);

  const handlePresetSelect = useCallback(
    (presetSets: PresetSet[]) => {
      const newSets: DiceSet[] = presetSets.map((ps) => ({
        id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: ps.name,
        dice: ps.dice,
      }));
      onUpdateSets([...room.sets, ...newSets]);
    },
    [room.sets, onUpdateSets],
  );

  const handleDeleteSet = useCallback(
    (setId: string) => {
      onUpdateSets(room.sets.filter((s) => s.id !== setId));
    },
    [room.sets, onUpdateSets],
  );

  const handleMoveSet = useCallback(
    (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= room.sets.length) return;
      const newSets = [...room.sets];
      [newSets[index], newSets[newIndex]] = [newSets[newIndex], newSets[index]];
      onUpdateSets(newSets);
    },
    [room.sets, onUpdateSets],
  );

  // Guard: only render for host
  if (!isHost) return null;

  const nonHostPlayers = room.players.filter((p) => !p.isHost);

  return (
    <div className="space-y-3">
      <h2 className="font-heading text-sm font-bold uppercase tracking-widest text-primary-light">
        Host-Steuerung
      </h2>

      {/* ---- Section 1: Room Info & Invite ---- */}
      <Section title="Raum & Einladung" defaultOpen>
        <div className="space-y-3">
          {/* Room code */}
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-bg px-3 py-1.5 font-mono text-lg font-bold tracking-[0.25em] text-primary-light">
              {room.code}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 rounded-md bg-primary/20 px-2.5 py-1.5 text-xs font-medium text-primary-light transition-colors hover:bg-primary/30"
            >
              <CopyIcon />
              {copied ? 'Kopiert!' : 'Link kopieren'}
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                room.isLocked ? 'bg-red-400' : 'bg-green-400'
              }`}
            />
            <span className="text-text-muted">
              Status: <span className="font-medium text-text">{room.isLocked ? 'Gesperrt' : 'Offen'}</span>
            </span>
          </div>
        </div>
      </Section>

      {/* ---- Section 2: Room Controls ---- */}
      <Section title="Raum-Steuerung" defaultOpen>
        <div className="flex flex-wrap gap-2">
          {/* Lock toggle */}
          <button
            type="button"
            onClick={onLockToggle}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              room.isLocked
                ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            }`}
          >
            <LockIcon locked={room.isLocked} />
            {room.isLocked ? 'Entsperren' : 'Sperren'}
          </button>

          {/* Clear history */}
          <button
            type="button"
            onClick={handleClearHistory}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              clearConfirm
                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            }`}
          >
            {clearConfirm ? 'Sicher?' : 'History löschen'}
          </button>
        </div>
      </Section>

      {/* ---- Section 3: Player Management ---- */}
      <Section title="Spieler" defaultOpen>
        {nonHostPlayers.length === 0 ? (
          <p className="text-xs text-text-muted">Keine weiteren Spieler im Raum.</p>
        ) : (
          <ul className="space-y-1.5">
            {nonHostPlayers.map((player) => (
              <li key={player.id} className="flex items-center justify-between rounded-md bg-bg/40 px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className={`text-sm ${player.connected ? 'text-text' : 'text-text-muted line-through'}`}>
                    {player.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleKick(player.id)}
                  className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                    kickConfirm === player.id
                      ? 'bg-red-500/25 text-red-300'
                      : 'text-red-400 hover:bg-red-500/15'
                  }`}
                >
                  {kickConfirm === player.id ? 'Wirklich kicken?' : 'Kicken'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---- Section 4: Dice Set Editor ---- */}
      <Section title="Würfel-Sets bearbeiten" defaultOpen>
        <div className="space-y-2">
          {/* Existing sets */}
          {room.sets.map((set, index) => {
            if (editingSetId === set.id) {
              return (
                <DiceSetEditor
                  key={set.id}
                  initial={{ name: set.name, dice: set.dice }}
                  onSave={(draft) => handleSaveSet(draft, set.id)}
                  onCancel={() => setEditingSetId(null)}
                />
              );
            }

            return (
              <div
                key={set.id}
                className="flex items-center justify-between rounded-md bg-bg/40 px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  {/* Reorder buttons */}
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleMoveSet(index, -1)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-text-muted transition-colors hover:text-primary disabled:opacity-20"
                      title="Nach oben"
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSet(index, 1)}
                      disabled={index === room.sets.length - 1}
                      className="rounded p-0.5 text-text-muted transition-colors hover:text-primary disabled:opacity-20"
                      title="Nach unten"
                    >
                      <ArrowDownIcon />
                    </button>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-text">{set.name}</span>
                    <span className="ml-2 text-xs text-text-muted">
                      {set.dice.map((d) => `${d.count}${d.type}`).join(' + ')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingSet(false);
                      setEditingSetId(set.id);
                    }}
                    className="rounded p-1 text-primary transition-colors hover:bg-primary/15"
                    title="Bearbeiten"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSet(set.id)}
                    className="rounded p-1 text-red-400 transition-colors hover:bg-red-400/15"
                    title="Löschen"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}

          {room.sets.length === 0 && !creatingSet && (
            <p className="text-xs text-text-muted">Noch keine Sets vorhanden.</p>
          )}

          {/* New set form */}
          {creatingSet ? (
            <DiceSetEditor
              onSave={(draft) => handleSaveSet(draft)}
              onCancel={() => setCreatingSet(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingSetId(null);
                setCreatingSet(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 py-2 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/10"
            >
              <PlusIcon />
              Neues Set erstellen
            </button>
          )}

          {/* Save current sets as preset */}
          {room.sets.length > 0 && (
            showSavePreset ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={savePresetName}
                  onChange={(e) => setSavePresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveAsPreset()}
                  placeholder="Preset-Name..."
                  className="flex-1 rounded-md border border-border-fantasy/40 bg-bg-light/50 px-2 py-1.5 text-xs text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveAsPreset}
                  disabled={!savePresetName.trim()}
                  className="rounded-md bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/30 disabled:opacity-40"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSavePreset(false); setSavePresetName(''); }}
                  className="rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:text-text"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSavePreset(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-green-600/40 py-2 text-xs font-semibold text-green-400 transition-colors hover:border-green-500 hover:bg-green-500/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" />
                </svg>
                Sets als Preset speichern
              </button>
            )
          )}

          {/* Preset loader */}
          <div className="relative" ref={presetMenuRef}>
            <button
              type="button"
              onClick={() => setPresetMenuOpen((o) => !o)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-600/40 py-2 text-xs font-semibold text-amber-400 transition-colors hover:border-amber-500 hover:bg-amber-500/10"
            >
              <PlusIcon />
              Preset laden
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-3 w-3 transition-transform ${presetMenuOpen ? 'rotate-180' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {presetMenuOpen && (
              <div className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border-fantasy/60 bg-bg-card shadow-xl">
                {/* Custom Presets */}
                {customPresets.length > 0 && (
                  <>
                    <div className="border-b border-border-fantasy/30 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">Eigene Presets</span>
                    </div>
                    {customPresets.map((cp) => (
                      <div
                        key={cp.id}
                        className="flex items-start gap-1 px-3 py-2 transition-colors hover:bg-primary/10"
                      >
                        <button
                          type="button"
                          onClick={() => handlePresetSelect(cp.sets)}
                          className="flex-1 text-left"
                        >
                          <span className="text-xs font-semibold text-text">{cp.label}</span>
                          <p className="text-[10px] text-text-muted">{cp.description}</p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomPreset(cp.id); }}
                          title="Preset löschen"
                          className="mt-0.5 shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-red-500/20 hover:text-red-400"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* Generische Sets */}
                <div className="border-b border-border-fantasy/30 px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Generisch</span>
                </div>
                <div className="flex flex-wrap gap-1 px-2 py-1.5">
                  {GENERIC_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handlePresetSelect([preset])}
                      className="rounded-md bg-bg-light/80 px-2 py-1 text-xs text-text transition-colors hover:bg-primary/20 hover:text-primary-light"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                {/* RPG-System-Pakete */}
                <div className="border-b border-t border-border-fantasy/30 px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">RPG-Systeme</span>
                </div>
                {RPG_PRESETS.map((pkg) => (
                  <button
                    key={pkg.label}
                    type="button"
                    onClick={() => handlePresetSelect(pkg.sets)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-primary/10"
                  >
                    <div>
                      <span className="text-xs font-semibold text-text">{pkg.label}</span>
                      <p className="text-[10px] text-text-muted">{pkg.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </Section>
    </div>
  );
}
