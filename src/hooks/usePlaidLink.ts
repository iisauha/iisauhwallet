/**
 * Link hook: create link token → open Link → exchange public token → sync transactions.
 * Does not change financial logic or auto-import into ledger; only links account and populates Detected Activity queue when backend is configured.
 */

import { useCallback, useRef, useState } from 'react';
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
} from '../api/detectedActivityApi';

type PlaidCreateConfig = {
  token: string;
  onSuccess: (public_token: string, metadata?: unknown) => void;
  onExit: (err: unknown, metadata?: unknown) => void;
  onEvent?: (eventName: string, metadata?: unknown) => void;
};

export function usePlaidLink() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const successHandlerRef = useRef<(public_token: string) => void>(() => {});

  const openLink = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { link_token } = await createLinkToken();
      const Plaid = (window as unknown as { Plaid?: { create: (config: PlaidCreateConfig) => { open: () => void } } }).Plaid;
      if (!Plaid) {
        setError('Plaid Link not loaded. Refresh and try again.');
        setLoading(false);
        return;
      }

      successHandlerRef.current = (public_token: string) => {
        exchangePublicToken(public_token)
          .then(() => syncTransactions())
          .then(() => {
            setError(null);
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : 'Exchange or sync failed');
          })
          .finally(() => {
            setLoading(false);
          });
      };

      const config: PlaidCreateConfig = {
        token: link_token,
        onSuccess: (public_token: string) => {
          successHandlerRef.current(public_token);
        },
        onExit: () => {
          setLoading(false);
        },
      };

      Plaid.create(config).open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link token');
      setLoading(false);
    }
  }, []);

  return { openLink, error, setError, loading };
}
