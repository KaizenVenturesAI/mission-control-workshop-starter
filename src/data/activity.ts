export type ActivityType = "tool" | "user" | "assistant";

export interface ActivityEntry {
  id: string;
  agent: string;
  action: string;
  type: ActivityType;
  timestamp: string;
  relativeTime: string;
}

export const activityFeed: ActivityEntry[] = [];
