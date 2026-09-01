"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  login as loginRequest,
  logout as logoutRequest,
  refresh,
  type AuthUser,
} from "@/lib/auth-api";

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const response = await refresh();

        if (!mounted) return;

        setAccessToken(response.accessToken);
        setUser(response.user);
      } catch {
        if (!mounted) return;

        setAccessToken(null);
        setUser(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginRequest(email, password);

    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    const token = accessToken;

    try {
      await logoutRequest(token);
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, [accessToken]);

  const refreshAuth = useCallback(async () => {
    try {
      const response = await refresh();

      setAccessToken(response.accessToken);
      setUser(response.user);

      return response.accessToken;
    } catch {
      setAccessToken(null);
      setUser(null);

      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      isLoading,
      isAuthenticated: Boolean(accessToken && user),
      login,
      logout,
      refreshAuth,
    }),
    [accessToken, user, isLoading, login, logout, refreshAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
