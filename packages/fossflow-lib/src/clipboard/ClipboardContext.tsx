// Instance-scoped clipboard — replaces the global module singleton.
// Providing via React context means multiple Isoflow instances on the same
// page each have their own clipboard, and testing is order-independent.

import React, { createContext, useContext, useRef, useMemo } from 'react';
import { ClipboardPayload } from './clipboard';

interface ClipboardContextValue {
  get: () => ClipboardPayload | null;
  set: (payload: ClipboardPayload) => void;
  has: () => boolean;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

export const ClipboardProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const clipboardRef = useRef<ClipboardPayload | null>(null);

  const value = useMemo<ClipboardContextValue>(
    () => ({
      get: () => clipboardRef.current,
      set: (payload) => {
        clipboardRef.current = payload;
      },
      has: () => clipboardRef.current !== null
    }),
    []
  );

  return (
    <ClipboardContext.Provider value={value}>
      {children}
    </ClipboardContext.Provider>
  );
};

export const useClipboard = (): ClipboardContextValue => {
  const ctx = useContext(ClipboardContext);
  if (!ctx)
    throw new Error('useClipboard must be used inside <ClipboardProvider>');
  return ctx;
};
