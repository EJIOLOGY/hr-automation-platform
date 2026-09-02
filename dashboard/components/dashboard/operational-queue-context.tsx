"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface OperationalQueueContextValue {
  selectedId: string | null;
  selectId: (id: string) => void;
  refreshKey: number;
  refresh: () => void;
}

const OperationalQueueContext = createContext<OperationalQueueContextValue | null>(null);

export function OperationalQueueProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const value = useMemo(() => ({
    selectedId,
    selectId: setSelectedId,
    refreshKey,
    refresh: () => setRefreshKey((key) => key + 1),
  }), [refreshKey]);

  return <OperationalQueueContext.Provider value={value}>{children}</OperationalQueueContext.Provider>;
}

export function useOperationalQueue() {
  const context = useContext(OperationalQueueContext);
  if (!context) throw new Error("Operational queue must be used within its provider.");
  return context;
}
