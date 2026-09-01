export interface ConversationEmployee {
  id: string;
  employeeNumber: string;
  fullName: string;
  phoneNumber: string;
}

export interface ConversationMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  createdAt: string;
}

export interface ConversationEscalation {
  id: string;
  status: "OPEN" | "IN_PROGRESS";
}

export interface Conversation {
  id: string;
  employee: ConversationEmployee;
  lastActivityAt: string;
  lastReadByHrAt: string | null;
  latestMessage: ConversationMessage | null;
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

const dashboardApiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export async function getConversations(
  accessToken: string,
): Promise<ConversationListResponse> {
  const headers = new Headers({ Accept: "application/json" });

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${dashboardApiUrl}/dashboard/conversations`, {
    headers,
    credentials: "include",
  });

  if (response.status === 401) {
    const { ApiError } = await import("./auth-api");
    throw new ApiError(401, "Unauthorized. Please log in again.");
  }

  if (!response.ok) {
    throw new Error("Unable to load conversations.");
  }

  return response.json() as Promise<ConversationListResponse>;
}
