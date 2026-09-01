export type SourceClass = "VERIFIED" | "LOCAL" | "CONFIG" | "USER_CONFIRMED" | "INFERRED" | "ESTIMATED" | "SEEDED" | "UNKNOWN";
export type Freshness = "fresh" | "stale" | "refreshing" | "failed";

export interface LiveDataResponse<T> {
  data: T;
  sourceClass: SourceClass;
  fetchedAt: string;
  freshness: Freshness;
  isFallback: boolean;
  staleAfter?: string;
  lastSuccessAt?: string;
  error?: string;
  limitations?: string;
  source: string;
  method: string;
}
