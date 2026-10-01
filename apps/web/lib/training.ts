import { api } from "./api";

export type BotLearning = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  source: "TRAINER" | "SELLER_EDIT" | "UNANSWERED";
  kind: "GUIDANCE" | "KNOWLEDGE" | "QUESTION";
  summary: string;
  payload: Record<string, any>;
  conversationKey: string | null;
  occurrences: number;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type Guidance = { id: string; text: string; enabled: boolean; source: string; createdAt: string };

export function listLearnings(status: "PENDING" | "APPROVED" | "REJECTED" | "ALL" = "PENDING"): Promise<BotLearning[]> {
  return api("/training/learnings", { query: { status } });
}

export function trainingSummary(): Promise<{ pending: number; questions: number; approved: number }> {
  return api("/training/summary");
}

export function approveLearning(
  id: string,
  override: { text?: string; activators?: string[]; answer?: string; context?: string } = {},
): Promise<{ ok: boolean }> {
  return api(`/training/learnings/${encodeURIComponent(id)}/approve`, { method: "POST", body: override });
}

export function rejectLearning(id: string): Promise<{ ok: boolean }> {
  return api(`/training/learnings/${encodeURIComponent(id)}/reject`, { method: "POST" });
}

export function getGuidance(): Promise<Guidance[]> {
  return api("/training/guidance");
}

export function saveGuidance(items: Guidance[]): Promise<Guidance[]> {
  return api("/training/guidance", { method: "PUT", body: { items } });
}

export function getTrainers(): Promise<{ numbers: string[] }> {
  return api("/training/trainers");
}

export function saveTrainers(numbers: string[]): Promise<{ numbers: string[] }> {
  return api("/training/trainers", { method: "PUT", body: { numbers } });
}
