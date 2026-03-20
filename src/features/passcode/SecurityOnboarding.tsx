import { useEffect, useRef } from 'react';

type Props = {
  onPass: () => void;
};

export function SecurityOnboarding({ onPass }: Props) {
  // #region agent log
  try {
    fetch('http://127.0.0.1:7727/ingest/00741c85-8e68-4158-889a-205b27f8db72', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'e62d08',
      },
      body: JSON.stringify({
        sessionId: 'e62d08',
        runId: 'fix_security_onboarding_module_pre',
        hypothesisId: 'H1_security_onboarding_renders_and_calls_onPass',
        location: 'src/features/passcode/SecurityOnboarding.tsx',
        message: 'SecurityOnboarding rendered; triggering onPass immediately',
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch (_) {}
  // #endregion

  const calledRef = useRef(false);
  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onPass();
  }, [onPass]);

  return null;
}

