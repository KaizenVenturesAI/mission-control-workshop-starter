import { z } from "zod";

export interface MeetingParticipant {
  name: string;
  role: string;
  company: string;
  isCLIENT: boolean;
  department?: string;
}

export interface MeetingBriefing {
  id: string;
  title: string;
  date: string;
  time: string;
  durationMin: number;
  participants: MeetingParticipant[];
  departments: string[];
  executiveSummary: string;
  strategicNote?: string;
  whatsHandled: string[];
  nextSteps: string[];
  transcriptUrl?: string;
  discordMessageIds?: string[];
  formattedNotesMarkdown?: string;
  sourceSystem?: "plaud" | "zoom" | "google_meet" | "google_drive" | "manual" | "fireflies";
  externalId?: string;
  sourceOwner?: string;
  sourceStartedAt?: string;
  sourceCreatedAt?: string;
  syncStatus?: "imported" | "processing" | "failed" | "skipped";
  transcriptSourceUrl?: string;
  sourceMetadata?: Record<string, unknown>;
  createdAt: string;
}

export const MEETINGS: MeetingBriefing[] = [];

export const meetingParticipantSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  company: z.string().min(1),
  isCLIENT: z.boolean(),
  department: z.string().min(1).optional(),
});

export const meetingBriefingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  durationMin: z.number().finite().nonnegative(),
  participants: z.array(meetingParticipantSchema),
  departments: z.array(z.string().min(1)),
  executiveSummary: z.string().min(1),
  strategicNote: z.string().min(1).optional(),
  whatsHandled: z.array(z.string()),
  nextSteps: z.array(z.string()),
  transcriptUrl: z.string().url().optional(),
  discordMessageIds: z.array(z.string().min(1)).optional(),
  formattedNotesMarkdown: z.string().min(1).optional(),
  sourceSystem: z.enum(["plaud", "zoom", "google_meet", "google_drive", "manual", "fireflies"]).optional(),
  externalId: z.string().min(1).optional(),
  sourceOwner: z.string().min(1).optional(),
  sourceStartedAt: z.string().min(1).optional(),
  sourceCreatedAt: z.string().min(1).optional(),
  syncStatus: z.enum(["imported", "processing", "failed", "skipped"]).optional(),
  transcriptSourceUrl: z.string().url().optional(),
  sourceMetadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().min(1),
});
