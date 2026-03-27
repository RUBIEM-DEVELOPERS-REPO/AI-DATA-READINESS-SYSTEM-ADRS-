import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "ANALYST" | "REVIEWER" | "VIEWER";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (minRole: UserRole) => boolean;
}

const ROLE_LEVEL: Record<UserRole, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  ANALYST: 3,
  REVIEWER: 2,
  VIEWER: 1,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ user: AuthUser } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      apiRequest("POST", "/api/auth/login", { username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => {
      // Set auth state to null synchronously (no loading flicker)
      queryClient.setQueryData(["/api/auth/me"], null);
      // Hard redirect so all React state is fully reset
      window.location.href = "/auth";
    },
    onError: () => {
      // Force redirect even on error — session may already be gone
      queryClient.setQueryData(["/api/auth/me"], null);
      window.location.href = "/auth";
    },
  });

  const user = data?.user ?? null;

  const can = (minRole: UserRole): boolean => {
    if (!user) return false;
    return (ROLE_LEVEL[user.role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
  };

  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
