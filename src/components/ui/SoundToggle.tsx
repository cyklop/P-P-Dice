'use client';

import { useTranslations } from 'next-intl';
import { useSound } from '@/hooks/useSound';

function SpeakerOnIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function SpeakerOffIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}

export default function SoundToggle() {
  const { isMuted, toggleMute } = useSound();
  const t = useTranslations('sound');

  const label = isMuted ? t('enable') : t('disable');

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={label}
      title={label}
      className="
        group relative flex h-9 w-9 items-center justify-center
        rounded-lg border-2 border-border-fantasy
        bg-bg-card text-primary
        shadow-[0_0_8px_rgba(245,158,11,0.15)]
        transition-all duration-200
        hover:border-primary hover:shadow-[0_0_14px_rgba(245,158,11,0.3)]
        active:scale-95
        cursor-pointer
      "
    >
      <span className="relative h-4.5 w-4.5">
        <SpeakerOnIcon
          className={`absolute inset-0 h-4.5 w-4.5 transition-all duration-300 ${
            !isMuted
              ? 'scale-100 opacity-100'
              : 'scale-0 opacity-0'
          }`}
        />
        <SpeakerOffIcon
          className={`absolute inset-0 h-4.5 w-4.5 transition-all duration-300 ${
            isMuted
              ? 'scale-100 opacity-100'
              : 'scale-0 opacity-0'
          }`}
        />
      </span>
    </button>
  );
}
