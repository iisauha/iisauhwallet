/**
 * Minimal Plaid Link hook: create link token → open Plaid Link → exchange public token → sync transactions.
 * Does not change financial logic or auto-import into ledger; only links account and populates Detected Activity queue.
 */

import { useCallback, useState } from 'react';
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
} from '../api/detectedActivityApi';

export function usePlaidLink() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openLink = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { link_token } = await createLinkToken();
      const Plaid = (window as unknown as { Plaid?: { create: (config: {
        token: string;
        onSuccess: (public_token: string) => void;
        onExit: () => void;
      }) => { open: () => void } } }).Plaid;
      if (!Plaid) {
        setError('Plaid Link not loaded. Refresh and try again.');
        return;
      }
      Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string) => {
          try {
            await exchangePublicToken(public_token);
            await syncTransactions();
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Exchange or sync failed');
          } finally {
            setLoading(false);
          }
        },
        onExit: () => {
          setLoading(false);
        },
      }).open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link token');
      setLoading(false);
    }
  }, []);

  return { openLink, error, setError, loading };
}
