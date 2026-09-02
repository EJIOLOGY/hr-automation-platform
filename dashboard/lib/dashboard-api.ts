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

export type EscalationStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

interface QueueEmployee extends ConversationEmployee {}

interface AssignedHrOfficer {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface QueueSession {
  id: string;
  currentState: string;
  isActive: boolean;
  lastActivityAt: string;
}

export interface EscalationRecord {
  id: string;
  reason: string;
  category: string | null;
  documentType: string | null;
  status: EscalationStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  employee: QueueEmployee;
  assignedHrOfficer: AssignedHrOfficer | null;
  session: QueueSession;
}

export interface HrRequestRecord extends Omit<EscalationRecord, "documentType"> {
  documentType: string | null;
  documentLabel: string | null;
}

interface CursorListResponse<T> {
  items: T[];
  nextCursor: string | null;
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

export async function getEscalations(
  accessToken: string,
  status?: EscalationStatus,
): Promise<CursorListResponse<EscalationRecord>> {
  const query = status ? `?status=${status}` : "";
  return dashboardRequest(`/dashboard/escalations${query}`, accessToken);
}

export async function getEscalation(
  id: string,
  accessToken: string,
): Promise<EscalationRecord> {
  return dashboardRequest(`/dashboard/escalations/${id}`, accessToken);
}

export async function claimEscalation(
  id: string,
  accessToken: string,
): Promise<EscalationRecord> {
  return dashboardRequest(`/dashboard/escalations/${id}/claim`, accessToken, {
    method: "POST",
  });
}

export async function resolveEscalation(
  id: string,
  accessToken: string,
): Promise<EscalationRecord> {
  return dashboardRequest(`/dashboard/escalations/${id}/resolve`, accessToken, {
    method: "POST",
  });
}

export async function closeEscalation(
  id: string,
  accessToken: string,
): Promise<EscalationRecord> {
  return dashboardRequest(`/dashboard/escalations/${id}/close`, accessToken, {
    method: "POST",
  });
}

export async function getHrRequests(
  accessToken: string,
  status?: EscalationStatus,
): Promise<CursorListResponse<HrRequestRecord>> {
  const query = status ? `?status=${status}` : "";
  return dashboardRequest(`/dashboard/hr-requests${query}`, accessToken);
}

export async function getHrRequest(
  id: string,
  accessToken: string,
): Promise<HrRequestRecord> {
  return dashboardRequest(`/dashboard/hr-requests/${id}`, accessToken);
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
