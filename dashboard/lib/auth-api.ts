const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid email or password.");
  }

  return response.json() as Promise<AuthResponse>;
}

export async function refresh(): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to refresh session.");
  }

  return response.json() as Promise<AuthResponse>;
}

export async function getCurrentUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Unable to retrieve current user.");
  }

  return response.json() as Promise<AuthUser>;
}

export async function logout(accessToken: string | null): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
  });
}

export interface MessageResponse {
  message: string;
}

export async function forgotPassword(email: string): Promise<MessageResponse> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    let message = "Unable to process password reset request.";
    try {
      const errorData = await response.json();
      if (typeof errorData?.message === "string") {
        message = errorData.message;
      } else if (
        Array.isArray(errorData?.message) &&
        errorData.message.length > 0
      ) {
        message = errorData.message.join(", ");
      }
    } catch {
      // Keep default message if response body is not JSON
    }
    throw new Error(message);
  }

  return response.json() as Promise<MessageResponse>;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<MessageResponse> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token, newPassword }),
  });

  if (!response.ok) {
    let message =
      "Unable to reset password. The link may be invalid or expired.";
    try {
      const errorData = await response.json();
      if (typeof errorData?.message === "string") {
        message = errorData.message;
      } else if (
        Array.isArray(errorData?.message) &&
        errorData.message.length > 0
      ) {
        message = errorData.message.join(", ");
      }
    } catch {
      // Keep default message if response body is not JSON
    }
    throw new Error(message);
  }

  return response.json() as Promise<MessageResponse>;
}

