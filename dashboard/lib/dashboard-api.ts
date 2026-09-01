export interface ConversationEmployee {
  id: string;
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
  department: string;
  jobTitle: string;
  status: string;
}

export interface ConversationPreview {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: string;
  content: string;
  sentByHrOfficerId: string | null;
  createdAt: string;
}

export interface ConversationMessage extends ConversationPreview {
  sessionId: string;
}

export interface ConversationEscalation {
  id: string;
  status: "OPEN" | "IN_PROGRESS";
  assignedHrOfficerId: string | null;
}

export interface Conversation {
  id: string;
  employee: ConversationEmployee;
  lastActivityAt: string;
  lastReadByHrAt: string | null;
  latestMessage: ConversationPreview | null;
  activeEscalation: ConversationEscalation | null;
}

export interface ConversationListResponse {
  items: Conversation[];
  pagination: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
}

export interface ConversationMessagesResponse {
  items: ConversationMessage[];
  pagination: ConversationListResponse["pagination"];
}

const dashboardApiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export async function getConversations(
  accessToken: string,
): Promise<ConversationListResponse> {
  return dashboardRequest<ConversationListResponse>(
    "/dashboard/conversations",
    accessToken,
  );
}

export async function getConversationMessages(
  sessionId: string,
  accessToken: string,
): Promise<ConversationMessagesResponse> {
  return dashboardRequest<ConversationMessagesResponse>(
    `/dashboard/conversations/${sessionId}/messages`,
    accessToken,
  );
}

export async function markConversationRead(
  sessionId: string,
  accessToken: string,
): Promise<void> {
  await dashboardRequest(`/dashboard/conversations/${sessionId}/read`, accessToken, {
    method: "POST",
  });
}

export async function sendConversationMessage(
  sessionId: string,
  content: string,
  accessToken: string,
): Promise<ConversationMessage> {
  return dashboardRequest<ConversationMessage>(
    `/dashboard/conversations/${sessionId}/messages`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ content }),
    },
  );
}

async function dashboardRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${dashboardApiUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const { ApiError } = await import("./auth-api");
    throw new ApiError(401, "Unauthorized. Please log in again.");
  }

  if (!response.ok) {
    throw new Error("Unable to complete this conversation request.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
