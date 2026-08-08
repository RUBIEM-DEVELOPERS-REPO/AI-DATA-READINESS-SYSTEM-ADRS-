import { QueryClient, QueryFunction } from "@tanstack/react-query";

// ─── CSRF Token Management ─────────────────────────────────────────────────

let _csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf-token", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch CSRF token");
  const data = await res.json();
  _csrfToken = data.token as string;
  return _csrfToken;
}

export async function getCsrfToken(): Promise<string> {
  if (_csrfToken) return _csrfToken;
  return fetchCsrfToken();
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ─── Core API Request ──────────────────────────────────────────────────────

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const isMutating = MUTATING_METHODS.has(method.toUpperCase());

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";

  if (isMutating) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // If CSRF token was rejected (e.g. session rotated), clear cache and retry once
  if (res.status === 403 && isMutating) {
    let body: any = {};
    try { body = await res.clone().json(); } catch { /* ignore */ }
    if (body?.code === "CSRF_ERROR") {
      _csrfToken = null;
      headers["X-CSRF-Token"] = await fetchCsrfToken();
      const retryRes = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
      await throwIfResNotOk(retryRes);
      return retryRes;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url = queryKey.join("/") as string;
    // The shared reverse-proxy cache historically cached /api/auth/me responses,
    // serving a stale 200 (old session's user) to every visitor — including
    // after signout — so the app appeared permanently logged in. Bypass it.
    // Dashboard stats must reflect live DB state, so bypass it as well.
    if (url === "/api/auth/me" || url === "/api/dashboard/stats") url += `?cb=${Date.now()}`;
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
