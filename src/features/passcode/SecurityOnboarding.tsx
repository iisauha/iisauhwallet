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
      className="passcode-gate-content"
      style={{
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        animation: 'passcodeFadeIn 0.3s ease-out',
      }}
    >
      <h1 style={{ margin: '0 0 12px 0', fontSize: '1.35rem', fontWeight: 600, textAlign: 'center' }}>
        Important Security Information — Please Read
      </h1>
      <p style={{ margin: '0 0 20px 0', fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.55, textAlign: 'center' }}>
        This app stores your data locally in your browser. The creator cannot access your data. There is no automatic connection to your bank. Only use the official site link. Save your recovery key and export JSON backups regularly.
      </p>

      <p style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))' }}>
        Please answer the following questions to continue. You must get all 5 correct.
      </p>

      {QUIZ.map((item, index) => (
        <div key={index} style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--ui-primary-text, var(--text))' }}>
            {index + 1}. {item.question}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.options.map((opt, optIndex) => (
              <label
                key={optIndex}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${answers[index] === optIndex ? 'var(--accent)' : 'var(--border)'}`,
                  background: answers[index] === optIndex ? 'var(--surface-hover)' : 'var(--surface)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                <input
                  type="radio"
                  name={`quiz-${index}`}
                  checked={answers[index] === optIndex}
                  onChange={() => {
                    const next = [...answers];
                    next[index] = optIndex;
                    setAnswers(next);
                  }}
                  disabled={submitted && wrongIndices.length > 0}
                />
                <span style={{ wordBreak: 'break-word' }}>{opt}</span>
              </label>
            ))}
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

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
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
  );
}
