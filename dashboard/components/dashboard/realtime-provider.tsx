"use client";

import {
  createContext,
  useCallback,
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
  const refreshAuthRef = useRef(refreshAuth);
  const refreshInFlightRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    refreshAuthRef.current = refreshAuth;
  }, [refreshAuth]);

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
    refreshInFlightRef.current = false;

    const handleConnect = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setIsConnected(true);
    };

    const handleDisconnect = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setIsConnected(false);
    };

    const handleConnectError = () => {
      if (socketRef.current !== socket) {
        return;
      }

      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      void refreshAuthRef.current().finally(() => {
        refreshInFlightRef.current = false;
      });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      if (socketRef.current === socket) {
        socketRef.current = null;
        setIsConnected(false);
      }

      socket.disconnect();
    };
  }, [accessToken]);

  const joinConversation = useCallback((sessionId: string) => {
    socketRef.current?.emit("conversation:join", sessionId);
  }, []);

  const leaveConversation = useCallback((sessionId: string) => {
    socketRef.current?.emit("conversation:leave", sessionId);
  }, []);

  const on = useCallback(
    (event: string, handler: (...args: unknown[]) => void): (() => void) => {
      const socket = socketRef.current;

      if (!socket) {
        return () => {};
      }

      socket.on(event, handler);

      return () => {
        socket.off(event, handler);
      };
    },
    [],
  );

  const value = useMemo<RealtimeContextValue>(
    () => ({
      isConnected,
      joinConversation,
      leaveConversation,
      on,
    }),
    [isConnected, joinConversation, leaveConversation, on],
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
