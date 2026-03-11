"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROOM_CODE_LENGTH } from "@/lib/constants";

/* ---------- tiny SVG dice icon ---------- */
function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* body */}
      <rect
        x="10"
        y="10"
        width="80"
        height="80"
        rx="14"
        stroke="currentColor"
        strokeWidth="4"
        fill="currentColor"
        fillOpacity={0.1}
      />
      {/* pips – showing a 5-face */}
      <circle cx="30" cy="30" r="6" fill="currentColor" />
      <circle cx="70" cy="30" r="6" fill="currentColor" />
      <circle cx="50" cy="50" r="6" fill="currentColor" />
      <circle cx="30" cy="70" r="6" fill="currentColor" />
      <circle cx="70" cy="70" r="6" fill="currentColor" />
    </svg>
  );
}

/* ---------- feature data ---------- */
const features = [
  {
    title: "3D Physik-Würfel",
    description: "Realistische Würfel-Physik mit cannon-es und Three.js.",
    icon: "\u2B22", // hexagon
  },
  {
    title: "Echtzeit Multiplayer",
    description: "Würfle gleichzeitig mit bis zu 8 Spielern via WebSocket.",
    icon: "\u26A1",
  },
  {
    title: "RPG Würfel-Sets",
    description: "Alle klassischen Würfel von D4 bis D20 verfügbar.",
    icon: "\u2B20", // pentagon
  },
  {
    title: "History & Stats",
    description: "Würfel-Verlauf und Statistiken für jeden Raum.",
    icon: "\u2630", // trigram
  },
];

/* ---------- page ---------- */
export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  function handleCodeChange(value: string) {
    const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cleaned.length <= ROOM_CODE_LENGTH) {
      setRoomCode(cleaned);
      setError("");
    }
  }

  function handleJoin() {
    if (roomCode.length !== ROOM_CODE_LENGTH) {
      setError(`Der Code muss genau ${ROOM_CODE_LENGTH} Zeichen lang sein.`);
      return;
    }
    router.push(`/room/${roomCode}`);
  }

  function handleCreate() {
    router.push("/room/new");
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12 sm:py-20">
      {/* -------- HERO -------- */}
      <section className="flex flex-col items-center text-center max-w-2xl mb-16">
        <div className="animate-dice-float mb-6">
          <DiceIcon className="w-24 h-24 sm:w-32 sm:h-32 text-primary" />
        </div>

        <h1 className="font-heading text-5xl sm:text-6xl font-bold tracking-wide text-shimmer mb-4">
          PP Dice
        </h1>

        <p className="text-lg sm:text-xl text-text-muted max-w-lg leading-relaxed">
          Würfle gemeinsam mit Freunden&nbsp;&mdash; in Echtzeit und 3D
        </p>
      </section>

      {/* -------- ACTIONS -------- */}
      <section className="w-full max-w-md flex flex-col gap-6 mb-20">
        {/* Create room */}
        <button
          onClick={handleCreate}
          className="w-full py-4 rounded-xl font-heading text-lg font-semibold tracking-wide
                     bg-primary text-bg hover:bg-primary-light
                     glow-amber transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                     cursor-pointer"
        >
          Raum erstellen
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <span className="flex-1 h-px bg-surface" />
          <span className="text-text-muted text-sm font-heading tracking-widest uppercase">
            oder
          </span>
          <span className="flex-1 h-px bg-surface" />
        </div>

        {/* Join room */}
        <div className="flex flex-col gap-3">
          <label
            htmlFor="room-code"
            className="font-heading text-sm text-text-muted tracking-wider uppercase"
          >
            Raum beitreten
          </label>

          <div className="flex gap-3">
            <input
              id="room-code"
              type="text"
              placeholder="CODE"
              value={roomCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
              maxLength={ROOM_CODE_LENGTH}
              className="flex-1 px-4 py-3 rounded-xl bg-bg-light border-2 border-surface
                         text-center text-xl font-mono tracking-[0.3em] uppercase
                         placeholder:text-surface
                         focus:border-primary focus:outline-none
                         transition-colors duration-200"
            />
            <button
              onClick={handleJoin}
              disabled={roomCode.length !== ROOM_CODE_LENGTH}
              className="px-6 py-3 rounded-xl font-heading font-semibold tracking-wide
                         bg-bg-light border-2 border-primary text-primary
                         hover:bg-primary hover:text-bg
                         disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bg-light disabled:hover:text-primary
                         transition-all duration-200 cursor-pointer"
            >
              Beitreten
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}
        </div>
      </section>

      {/* -------- FEATURES -------- */}
      <section className="w-full max-w-4xl">
        <h2 className="font-heading text-2xl font-semibold text-center mb-8 text-primary-light tracking-wide">
          Features
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="fantasy-border rounded-xl p-6 bg-bg-card
                         hover:border-primary transition-colors duration-300"
            >
              <span className="text-3xl mb-3 block">{f.icon}</span>
              <h3 className="font-heading text-lg font-semibold text-primary-light mb-1">
                {f.title}
              </h3>
              <p className="text-text-muted text-sm leading-relaxed">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* -------- FOOTER -------- */}
      <footer className="mt-20 text-text-muted text-xs text-center font-heading tracking-wider">
        PP Dice &middot; Multiplayer 3D Dice Roller
      </footer>
    </main>
  );
}
