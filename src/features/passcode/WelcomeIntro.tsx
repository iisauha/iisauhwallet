import { useEffect, useState } from 'react';

const STEPS = [
  'Hey there, welcome in!',
  'This is your personal finance app. Everything stays on your device, nice and private.',
  "To keep things secure, you'll pick a short passcode. Think of it like a lock on your front door.",
  'You can also add a hint and a couple security questions, just in case you forget your code.',
  "Then we'll give you a recovery key. Save it somewhere safe. It's your backup way back in.",
  'After all that, a quick walkthrough will show you around so you feel right at home.',
  "That's it! Just a few quick steps and you're all set. Let's go.",
];

const MS_PER_WORD = 400;
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
  const holdMs = wordCount(text) * MS_PER_WORD;

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
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 300,
          textAlign: 'center',
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'var(--ui-primary-text, var(--text, #f0f0f0))',
          lineHeight: 1.45,
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
