import type { AuthSession } from "../types";

async function parseJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown>;
}

export async function getAuthSession(): Promise<AuthSession> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`auth session failed with ${response.status}`);
  }

  const payload = (await parseJson(response)) as Partial<AuthSession>;

  return {
    enabled: Boolean(payload.enabled),
    authenticated: Boolean(payload.authenticated),
  };
}

export async function loginWithPassword(password: string): Promise<AuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  const payload = (await parseJson(response)) as Partial<AuthSession> & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || `auth login failed with ${response.status}`);
  }

  return {
    enabled: Boolean(payload.enabled),
    authenticated: Boolean(payload.authenticated),
  };
}

export async function logoutAuth(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}
