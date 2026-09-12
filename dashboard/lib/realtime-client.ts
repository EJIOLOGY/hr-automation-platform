/**
 * The realtime gateway lives on the same NestJS server as the REST API,
 * but Socket.IO connects to the server root (its own default path,
 * `/socket.io`), not the `/api/v1` prefix `setGlobalPrefix` applies to
 * HTTP controllers. This strips that prefix off the existing API URL so
 * both stay in sync from a single env var.
 */
export function getRealtimeOrigin(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export const REALTIME_NAMESPACE = "/realtime";
