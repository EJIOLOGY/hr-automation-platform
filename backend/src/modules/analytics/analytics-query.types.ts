export interface AnalyticsOverview {
  totalConversations: number;
  activeEmployees: number;
  botResolutionRate: number | null;
  escalationRate: number | null;
  averageFirstResponseSeconds: number | null;
  hrEscalations: number;
}

export interface ConversationActivityPoint {
  label: string;
  conversations: number;
  completed: number;
  escalated: number;
}

export interface ConversationActivity {
  daily: ConversationActivityPoint[];
  weekly: ConversationActivityPoint[];
  monthly: ConversationActivityPoint[];
}

export interface HrServicesAnalytics {
  dataAvailable: boolean;
  items: never[];
}

export interface JourneyStep {
  type: string;
  label: string;
  count: number;
}

export interface JourneyAnalytics {
  steps: JourneyStep[];
}

export interface EscalationCategoryAnalytics {
  category: string | null;
  count: number;
}

export interface EscalationAnalytics {
  total: number;
  averagePerDay: number | null;
  categories: EscalationCategoryAnalytics[];
}

export interface TopPathsAnalytics {
  dataAvailable: boolean;
  items: never[];
}

export interface UnrecognizedInputItem {
  id: string;
  sessionId: string;
  employeeId: string | null;
  department: string | null;
  occurredAt: string;
  reviewedAt: string | null;
}

export interface UnrecognizedInputsAnalytics {
  items: UnrecognizedInputItem[];
}
