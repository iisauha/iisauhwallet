import { useEffect, useState } from 'react';

// Each step is an array of word groups that animate in one at a time
const STEPS: string[][] = [
  ['Hey there,', 'welcome in!'],
  ['This is your', 'personal finance app.', 'Everything stays on your device,', 'nice and private.'],
  ['To keep things secure,', "you'll pick a short passcode.", 'Think of it like a lock', 'on your front door.'],
  ['You can also add a hint', 'and a couple security questions,', 'just in case you', 'forget your code.'],
  ["Then we'll give you", 'a recovery key.', 'Save it somewhere safe.', "It's your backup way back in."],
  ['After all that,', 'a quick walkthrough', 'will show you around', 'so you feel right at home.'],
  ["That's it!", 'Just a few quick steps', "and you're all set.", "Let's go."],
];

const WORD_STAGGER = 500;    // ms between each word group appearing
const HOLD_AFTER_LAST = 1200; // ms to hold after last word group before fading out
const FADE_OUT = 400;         // ms for fade out transition
const PAUSE_BETWEEN = 300;    // ms blank between steps

export function WelcomeIntro({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [visibleWords, setVisibleWords] = useState(0);
  const [fading, setFading] = useState(false);
  const [blank, setBlank] = useState(false);

  const step = STEPS[stepIdx];
  const totalWords = step.length;
  const stepDuration = totalWords * WORD_STAGGER + HOLD_AFTER_LAST;

  useEffect(() => {
    setVisibleWords(0);
    setFading(false);
    setBlank(false);

    // Stagger each word group in
    const wordTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < totalWords; i++) {
      wordTimers.push(setTimeout(() => setVisibleWords(i + 1), i * WORD_STAGGER + 80));
    }

    // Start fade out
    const fadeTimer = setTimeout(() => setFading(true), stepDuration);

    // Go blank, then advance
    const blankTimer = setTimeout(() => setBlank(true), stepDuration + FADE_OUT);

    const nextTimer = setTimeout(() => {
      if (stepIdx < STEPS.length - 1) {
        setStepIdx(s => s + 1);
      } else {
        onDone();
      }
    }, stepDuration + FADE_OUT + PAUSE_BETWEEN);

    return () => {
      wordTimers.forEach(clearTimeout);
      clearTimeout(fadeTimer);
      clearTimeout(blankTimer);
      clearTimeout(nextTimer);
    };
  }, [stepIdx, totalWords, stepDuration, onDone]);

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
          minHeight: 120,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: blank ? 0 : fading ? 0 : 1,
          transform: fading ? 'translateY(-8px)' : 'translateY(0)',
          transition: `opacity ${FADE_OUT}ms ease, transform ${FADE_OUT}ms ease`,
        }}
      >
        {step.map((words, i) => (
          <span
            key={`${stepIdx}-${i}`}
            style={{
              display: 'block',
              fontSize: i === 0 && stepIdx === 0 ? '1.8rem' : '1.35rem',
              fontWeight: 600,
              color: 'var(--ui-primary-text, var(--text, #f0f0f0))',
              lineHeight: 1.6,
              fontFamily: 'var(--app-font-family)',
              opacity: i < visibleWords ? 1 : 0,
              transform: i < visibleWords ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
              transition: 'opacity 350ms ease, transform 350ms ease',
            }}
          >
            {words}
          </span>
        ))}
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
              width: i === stepIdx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i <= stepIdx
                ? 'var(--accent, #FE841B)'
                : 'var(--border, #444)',
              opacity: i <= stepIdx ? 1 : 0.35,
              transition: 'width 300ms ease, background 300ms ease, opacity 300ms ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
