import { useEffect, useState } from 'react';

const STEPS = [
  'Hey there, welcome in!',
  'This is your personal finance app. Everything stays on your device, nice and private.',
  "To keep things secure, you'll pick a short passcode. Think of it like a lock on your front door.",
  "You can also add a hint and a couple security questions, just in case you forget your code.",
  "Then we'll give you a recovery key. Save it somewhere safe. It's your backup way back in.",
  "After all that, a quick walkthrough will show you around so you feel right at home.",
  "That's it! Just a few quick steps and you're all set. Let's go.",
];

const STEP_DURATION = 2400;
const FADE_DURATION = 400;

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in');

  useEffect(() => {
    const inTimer = setTimeout(() => setPhase('visible'), 50);
    const outTimer = setTimeout(() => setPhase('out'), STEP_DURATION - FADE_DURATION);
    const nextTimer = setTimeout(() => {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(s => s + 1);
        setPhase('in');
      } else {
        onDone();
      }
    }, STEP_DURATION);
    return () => { clearTimeout(inTimer); clearTimeout(outTimer); clearTimeout(nextTimer); };
  }, [currentStep, onDone]);

  const text = STEPS[currentStep];
  const isVisible = phase === 'visible';
  const isFadingOut = phase === 'out';

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
          maxWidth: 280,
          textAlign: 'center',
          opacity: isVisible ? 1 : isFadingOut ? 0 : 0,
          transform: isVisible
            ? 'translateY(0) scale(1)'
            : isFadingOut
              ? 'translateY(-10px) scale(0.97)'
              : 'translateY(14px) scale(0.96)',
          transition: `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`,
          fontSize: '1.15rem',
          fontWeight: 600,
          color: 'var(--ui-primary-text, var(--text, #f0f0f0))',
          lineHeight: 1.5,
          fontFamily: 'var(--app-font-family)',
        }}
      >
        {text}
      </div>

      {/* Progress dots */}
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
              width: i === currentStep ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i <= currentStep
                ? 'var(--accent, #FE841B)'
                : 'var(--border, #444)',
              opacity: i <= currentStep ? 1 : 0.35,
              transition: 'width 300ms ease, background 300ms ease, opacity 300ms ease',
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 16,
          background: 'none',
          border: 'none',
          color: 'var(--muted, #a0a0a0)',
          fontSize: '0.85rem',
          cursor: 'pointer',
          padding: '8px 12px',
          fontFamily: 'var(--app-font-family)',
        }}
      >
        Skip
      </button>
    </div>
  );
}
