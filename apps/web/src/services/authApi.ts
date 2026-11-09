
export type PortCode = "gulfport" | "miami";

export interface Manager {
  id: string;
  name: string;
  email: string;
  port: PortCode;
}

interface AuthResponse {
  manager: Manager;
}

// POST /api/auth/login
export async function login(
  email: string,
  password: string
): Promise<Manager> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid email or password");
    }
    throw new Error("Unable to log in");
  }

  const data = (await response.json()) as AuthResponse;
  return data.manager;
}

// GET /api/auth/me
export async function getCurrentManager(): Promise<Manager | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to check login status");
  }

  const data = (await response.json()) as AuthResponse;
  return data.manager;
}

// POST /api/auth/logout
export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to log out");
  }
}
