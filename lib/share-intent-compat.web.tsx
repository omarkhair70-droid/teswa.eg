import { Fragment, type ReactNode } from 'react';

type ShareIntentProviderProps = {
  children: ReactNode;
};

type ShareIntentContextValue = {
  hasShareIntent: boolean;
  shareIntent: null;
  resetShareIntent: () => Promise<void>;
  error: null;
};

export function ShareIntentProvider({ children }: ShareIntentProviderProps) {
  return <Fragment>{children}</Fragment>;
}

export function useShareIntentContext(): ShareIntentContextValue {
  return {
    hasShareIntent: false,
    shareIntent: null,
    resetShareIntent: async () => undefined,
    error: null,
  };
}
