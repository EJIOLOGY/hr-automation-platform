"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/components/auth/auth-provider";
import { getRealtimeOrigin, REALTIME_NAMESPACE } from "@/lib/realtime-client";

interface RealtimeContextValue {
  /** True once the socket has completed its handshake for the current token. */
  isConnected: boolean;
  joinConversation: (sessionId: string) => void;
  leaveConversation: (sessionId: string) => void;
  /** Subscribe to a realtime event; returns an unsubscribe function. */
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { accessToken, refreshAuth } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsConnected(false);
      return;
    }

    const socket = io(`${getRealtimeOrigin()}${REALTIME_NAMESPACE}`, {
      auth: { token: accessToken },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    // If the access token expired, the gateway drops the connection during
    // handshake. Refresh once and reconnect with the new token rather than
    // leaving the dashboard silently stuck without realtime updates.
    socket.on("connect_error", () => {
      void refreshAuth();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      isConnected,
      joinConversation: (sessionId: string) => {
        socketRef.current?.emit("conversation:join", sessionId);
      },
      leaveConversation: (sessionId: string) => {
        socketRef.current?.emit("conversation:leave", sessionId);
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        const socket = socketRef.current;

        if (!socket) {
          return () => {};
        }

        socket.on(event, handler);
        return () => socket.off(event, handler);
      },
    }),
    [isConnected],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);

  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider.");
  }

  return context;
}
