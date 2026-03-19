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
    question: 'Does this app automatically connect to your bank account by default?',
    options: ['Yes', 'No'],
    correctIndex: 1,
  },
  {
    question: 'Where is your wallet data stored by default?',
    options: ['On a central server', 'Locally in your browser', "The creator's computer"],
    correctIndex: 1,
  },
  {
    question: 'Will the creator ever ask you for your passcode or recovery key?',
    options: ['Yes', 'No'],
    correctIndex: 1,
  },
  {
    question: 'What should you save in case you forget your passcode?',
    options: ['Email the creator', 'Recovery key and JSON backup', 'Nothing; the creator can reset it'],
    correctIndex: 1,
  },
  {
    question: 'What is the official website where this app is hosted?',
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
      <div className="modal" style={{ width: '100%', maxWidth: 760, animation: 'passcodeFadeIn 0.3s ease-out' }}>
        <h3 style={{ marginBottom: 12, fontSize: '1.4rem', fontWeight: 700 }}>Important Security Information — Please Read</h3>
        <p style={{ margin: '0 0 20px 0', fontSize: '0.95rem', lineHeight: 1.55, textAlign: 'center' }}>
          This app stores your data locally in your browser. The creator cannot access your data. There is no automatic connection to your bank. Only use the official site link. Save your recovery key and export JSON backups regularly.
        </p>

        <p style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 600, textAlign: 'center' }}>
          Please answer the following questions to continue. You must get all 5 correct.
        </p>

        {QUIZ.map((item, index) => (
          <div key={index} style={{ marginBottom: 18 }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 700 }}>
              {index + 1}. {item.question}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {item.options.map((opt, optIndex) => {
                const checked = answers[index] === optIndex;
                return (
                  <label
                    key={optIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                      background: checked ? 'var(--surface-hover)' : 'var(--surface)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
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
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span style={{ wordBreak: 'break-word' }}>{opt}</span>
                  </label>
                );
              })}
            </div>
            {submitted && wrongIndices.includes(index) && (
              <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--red)' }}>
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
