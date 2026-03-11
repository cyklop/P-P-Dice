'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ColorPicker from '@/components/room/ColorPicker';
import { PLAYER_COLORS } from '@/lib/constants';

const NAME_MAX_LENGTH = 20;
const STORAGE_KEY_NAME = 'pp_dice_player_name';
const STORAGE_KEY_COLOR = 'pp_dice_player_color';

function getSavedName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_NAME) ?? '';
  } catch {
    return '';
  }
}

function getSavedColor(takenColors: string[]): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_COLOR);
    if (saved && !takenColors.includes(saved)) return saved;
  } catch {
    // ignore
  }
  // Fallback: random available color
  const available = PLAYER_COLORS.filter((c) => !takenColors.includes(c));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function saveName(name: string) {
  try { localStorage.setItem(STORAGE_KEY_NAME, name); } catch { /* ignore */ }
}

function saveColor(color: string) {
  try { localStorage.setItem(STORAGE_KEY_COLOR, color); } catch { /* ignore */ }
}

export interface JoinDialogProps {
  /** Colors already taken by other players in the room. */
  takenColors: string[];
  /** Names already used by players in the room. */
  existingNames?: string[];
  /** Called when the user submits a valid name + color combination. */
  onJoin: (name: string, color: string) => void;
  /** Controls dialog visibility. */
  isOpen: boolean;
}

export default function JoinDialog({
  takenColors,
  existingNames = [],
  onJoin,
  isOpen,
}: JoinDialogProps) {
  const [name, setName] = useState(() => getSavedName());
  const [selectedColor, setSelectedColor] = useState<string | null>(() => getSavedColor(takenColors));
  const [touched, setTouched] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  // Focus the name input when the dialog opens.
  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen]);

  // Re-initialize color once takenColors are known (they arrive async)
  useEffect(() => {
    if (initializedRef.current) return;
    if (takenColors.length > 0 || isOpen) {
      initializedRef.current = true;
      setSelectedColor((prev) => {
        if (prev && !takenColors.includes(prev)) return prev;
        return getSavedColor(takenColors);
      });
    }
  }, [takenColors, isOpen]);

  // If the previously selected color gets taken, pick a new one.
  useEffect(() => {
    if (selectedColor && takenColors.includes(selectedColor)) {
      setSelectedColor(getSavedColor(takenColors));
    }
  }, [takenColors, selectedColor]);

  const trimmedName = name.trim();
  const isNameTaken = trimmedName.length > 0 && existingNames.some(
    (n) => n.toLowerCase() === trimmedName.toLowerCase()
  );
  const isValid = trimmedName.length >= 1 && selectedColor !== null;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (!isValid || selectedColor === null) return;
      saveName(trimmedName);
      saveColor(selectedColor);
      onJoin(trimmedName, selectedColor);
    },
    [isValid, trimmedName, selectedColor, onJoin],
  );

  if (!isOpen) return null;

  return (
    /* ----- Backdrop ----- */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      {/* ----- Dialog Panel ----- */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-amber-900/50 bg-gray-900/95 p-6 shadow-2xl shadow-amber-950/30 sm:p-8"
      >
        {/* Heading */}
        <h2 className="mb-6 text-center font-serif text-2xl font-bold tracking-wide text-amber-200 sm:text-3xl">
          Raum beitreten
        </h2>

        {/* ----- Name Field ----- */}
        <label
          htmlFor="join-name"
          className="mb-1.5 block text-sm font-medium text-amber-100/80"
        >
          Dein Name
        </label>
        <input
          ref={nameInputRef}
          id="join-name"
          type="text"
          maxLength={NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Abenteurername eingeben..."
          autoComplete="off"
          className={`
            mb-1 w-full rounded-lg border bg-gray-800/80 px-4 py-2.5 text-gray-100
            placeholder:text-gray-500
            focus:outline-none focus:ring-2 focus:ring-amber-500/60
            ${
              touched && trimmedName.length === 0
                ? 'border-red-500/70'
                : 'border-gray-700'
            }
          `}
        />
        {touched && trimmedName.length === 0 && (
          <p className="mb-3 text-xs text-red-400">
            Bitte gib einen Namen ein.
          </p>
        )}
        {isNameTaken && (
          <p className="mb-3 text-xs text-amber-400">
            Dieser Name wird bereits im Raum verwendet.
          </p>
        )}
        {!isNameTaken && !(touched && trimmedName.length === 0) && (
          <p className="mb-3 text-xs text-transparent">&#8203;</p>
        )}

        {/* ----- Color Picker ----- */}
        <p className="mb-2 text-sm font-medium text-amber-100/80">
          Wähle deine Farbe
        </p>
        <div className="mb-1">
          <ColorPicker
            takenColors={takenColors}
            selectedColor={selectedColor}
            onSelect={setSelectedColor}
          />
        </div>
        {touched && selectedColor === null && (
          <p className="mt-1 mb-3 text-center text-xs text-red-400">
            Bitte wähle eine Farbe.
          </p>
        )}
        {!(touched && selectedColor === null) && (
          <p className="mt-1 mb-3 text-center text-xs text-transparent">
            &#8203;
          </p>
        )}

        {/* ----- Submit ----- */}
        <button
          type="submit"
          disabled={touched && !isValid}
          className={`
            mt-2 w-full rounded-lg px-6 py-3 text-lg font-bold tracking-wide transition-all duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900
            ${
              touched && !isValid
                ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
                : 'border border-amber-700/60 bg-gradient-to-b from-amber-700 to-amber-900 text-amber-100 shadow-lg shadow-amber-900/40 hover:from-amber-600 hover:to-amber-800 active:scale-[0.98]'
            }
          `}
        >
          Beitreten
        </button>
      </form>
    </div>
  );
}
