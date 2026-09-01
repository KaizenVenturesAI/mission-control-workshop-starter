export type GeographyFilter = "All";

export type PerformanceRating = 1 | 2 | 3 | 4 | 5;

export const PERFORMANCE_RATINGS: { value: PerformanceRating; label: string; color: string }[] = [
  { value: 5, label: "Redefines the Bar", color: "#4ade80" },
  { value: 4, label: "Above the Bar", color: "#60a5fa" },
  { value: 3, label: "At the Bar", color: "rgba(255,255,255,0.7)" },
  { value: 2, label: "Approaching the Bar", color: "#f59e0b" },
  { value: 1, label: "Below the Bar", color: "#ef4444" },
];

export interface PerformanceReview {
  date: string;
  rating: PerformanceRating | string; // string for backward compat with old data
  notes: string;
  reviewer: string;
}

export type ReviewStatus = "current" | "due" | "overdue" | "new-hire";

export interface ImprovementPlan {
  active: boolean;
  startDate?: string;
  notes?: string;
  nextCheckIn?: string;
}

export interface EmployeeRecord {
  startDate?: string | null;
  promotions?: number;
  lastPromotionDate?: string | null;
  performanceReviews?: PerformanceReview[];
  crmContactId?: string | null;
  suggestedPromotion?: boolean;
  suggestedPromotionNote?: string;
  improvementPlan?: ImprovementPlan;
  reviewStatus?: ReviewStatus;
  photoUrl?: string | null;
  nextReviewDate?: string | null;
  auditLog?: AuditEntry[];
  lastUpdatedAt?: string | null;
  lastUpdatedBy?: string | null;
}

export interface AuditEntry {
  timestamp: string;
  action: string; // e.g. 'field_update', 'review_added', 'pip_activated', 'promotion_suggested'
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  actor?: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  managerName: string | null;
  managerNames?: string[];
  location: string;
  locationLabel: string;
  level: string;
  status: "Active" | "Inactive";
  department: string;
  role: string;
  hourlyRate?: string | null;
  monthlyComp?: string | null;
  coachingRate?: string | null;
  paymentMethod?: string | null;
  paymentUsername?: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  photoUrl?: string | null;
  profileTitle?: string | null;
  bio?: string | null;
}

export interface OrgPerson extends PersonRecord {
  managerId: string | null;
  managerIds: string[];
  secondaryManagerIds: string[];
  directReportIds: string[];
  allDirectReportIds: string[];
  directReports: number;
  totalDownstream: number;
  depth: number;
  isLeader: boolean;
  isRoot: boolean;
}

export interface OrgTreeNode {
  person: OrgPerson;
  children: OrgTreeNode[];
}
