import { useEffect, useState } from 'react';

const STEPS = [
  'Hey there :)',
  'This is a personal finance app. Your data stays on this device, nothing is uploaded anywhere.',
  "You'll start by creating a 6-digit passcode. This encrypts everything stored on your device.",
  "Next, you can set a passcode hint and security questions. These help you recover access if you forget your code.",
  "You'll also get a recovery key. It's a one-time backup code, save it somewhere safe.",
  "After that, a short guide will walk you through how the app works.",
  "That's everything. Let's get you set up.",
];

const MS_PER_WORD = 200;
const MIN_HOLD = 1400;
const FADE_DURATION = 350;
const PAUSE_BETWEEN = 250;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  const text = STEPS[stepIdx];
  const holdMs = Math.max(MIN_HOLD, wordCount(text) * MS_PER_WORD);

  useEffect(() => {
    setVisible(false);
    setFading(false);

    const inTimer = setTimeout(() => setVisible(true), 50);
    const fadeTimer = setTimeout(() => setFading(true), holdMs);
    const nextTimer = setTimeout(() => {
      if (stepIdx < STEPS.length - 1) {
        setStepIdx(s => s + 1);
      } else {
        onDone();
      }
    }, holdMs + FADE_DURATION + PAUSE_BETWEEN);

    return () => { clearTimeout(inTimer); clearTimeout(fadeTimer); clearTimeout(nextTimer); };
  }, [stepIdx, holdMs, onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg, #252526)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: 28,
      }}
    >
      <div
        style={{
          maxWidth: 300,
          textAlign: 'center',
          fontSize: '1.35rem',
          fontWeight: 600,
          color: 'var(--ui-primary-text, var(--text, #f0f0f0))',
          lineHeight: 1.4,
          fontFamily: 'var(--app-font-family)',
          opacity: visible && !fading ? 1 : 0,
          transform: visible && !fading
            ? 'translateY(0) scale(1)'
            : fading
              ? 'translateY(-8px) scale(0.97)'
              : 'translateY(12px) scale(0.96)',
          transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
        }}
      >
        {text}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === stepIdx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i <= stepIdx ? 'var(--accent, #FE841B)' : 'var(--border, #444)',
              opacity: i <= stepIdx ? 1 : 0.35,
              transition: 'width 300ms ease, background 300ms ease, opacity 300ms ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
