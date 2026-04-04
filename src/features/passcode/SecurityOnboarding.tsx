import { useState } from 'react';
import { saveSecurityQuizCompleted } from '../../state/storage';

const OFFICIAL_SITE = 'https://iisauha.github.io/iisauhwallet/';

type QuizItem = {
  question: string;
  options: string[];
  correctIndex: number;
};

const QUIZ: QuizItem[] = [
  {
    question: 'Does the app auto-connect to your bank by default?',
    options: ['Yes', 'No'],
    correctIndex: 1,
  },
  {
    question: 'Can the server or developer read your financial data?',
    options: ['Yes', 'No — data is encrypted with your passcode before syncing'],
    correctIndex: 1,
  },
  {
    question: 'Will the creator ask for your passcode/key?',
    options: ['Yes', 'No'],
    correctIndex: 1,
  },
  {
    question: 'What should you save to recover access?',
    options: ['Email the creator', 'Your recovery key', 'Nothing; the creator can reset it'],
    correctIndex: 1,
  },
  {
    question: 'What is the official site URL?',
    options: [
      'https://iisauha.github.io/iisauhwallet/',
      'https://iisauhwallet.github.io/',
      'https://iisauhaguilar.github.io/',
    ],
    correctIndex: 0,
  },
];

export function SecurityOnboarding({ onPass }: { onPass: () => void }) {
  const [answers, setAnswers] = useState<number[]>(() => QUIZ.map(() => -1));
  const [submitted, setSubmitted] = useState(false);
  const [wrongIndices, setWrongIndices] = useState<number[]>([]);

  const allAnswered = answers.every((a) => a >= 0);
  const score = answers.filter((a, i) => a === QUIZ[i].correctIndex).length;
  const passed = score === QUIZ.length;

  const handleSubmit = () => {
    if (!allAnswered) return;
    setSubmitted(true);
    const wrong = QUIZ.map((_, i) => i).filter((i) => answers[i] !== QUIZ[i].correctIndex);
    setWrongIndices(wrong);
    if (wrong.length === 0) {
      saveSecurityQuizCompleted(true);
      onPass();
    }
  };

  const handleRetry = () => {
    setSubmitted(false);
    setAnswers(QUIZ.map(() => -1));
    setWrongIndices([]);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background: 'transparent', // keep the passcode gate background (app background)
      }}
    >
      <div className="modal" style={{ width: '100%', maxWidth: 560, animation: 'passcodeFadeIn 0.3s ease-out' }}>
        <h3 style={{ marginBottom: 10, fontSize: '1.15rem', fontWeight: 700 }}>Important Security Information</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', lineHeight: 1.55 }}>
          Your data is encrypted with your passcode before syncing to the cloud. The creator cannot access your data. There is no automatic connection to your bank. Only use the official site link. Save your recovery key — it is your lifeline if you forget your passcode.
        </p>

        <p style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 600 }}>
          Answer all 5 questions correctly to continue.
        </p>

        {QUIZ.map((item, index) => (
          <div
            key={index}
            style={{
              marginBottom: 14,
              padding: 12,
              border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
              borderRadius: 12,
              background: 'var(--ui-modal-bg, var(--surface))'
            }}
          >
            <p style={{ margin: '0 0 10px 0', fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.4 }}>
              {index + 1}. {item.question}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {item.options.map((opt, optIndex) => {
                const checked = answers[index] === optIndex;
                return (
                  <label
                    key={optIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${checked ? 'var(--accent)' : 'var(--ui-border, var(--border))'}`,
                      background: checked ? 'var(--surface-hover)' : 'var(--surface)',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = [...answers];
                        // Keep it "single choice" UX by toggling off the current option or switching to another.
                        next[index] = checked ? -1 : optIndex;
                        setAnswers(next);
                      }}
                      disabled={submitted && wrongIndices.length > 0}
                      style={{ accentColor: 'var(--accent)', margin: 0, flexShrink: 0 }}
                    />
                    <span style={{ wordBreak: 'break-word', lineHeight: 1.35 }}>{opt}</span>
                  </label>
                );
              })}
            </div>
            {submitted && wrongIndices.includes(index) && (
              <p style={{ margin: '10px 0 0 0', fontSize: '0.82rem', color: 'var(--red)' }}>
                Incorrect. The correct answer is: {item.options[item.correctIndex]}
              </p>
            )}
          </div>
        ))}

        {submitted && wrongIndices.length > 0 && (
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>
            You got {score} out of 5 correct. Please review and try again.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          {submitted && wrongIndices.length > 0 ? (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleRetry}>
              Try again
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleSubmit}
              disabled={!allAnswered}
            >
              {allAnswered ? 'Submit answers' : 'Answer all questions'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
