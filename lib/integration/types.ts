/**
 * PollTech Integration Types & Contracts
 * Specification defined in Radar Enhancements & Customization Technical Design v1.0
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  correlationId: string;
  timestamp: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
    message: string;
    details?: ApiErrorDetail[];
  };
  correlationId: string;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface CursorPayload {
  publishedAt: string;
  id: number;
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
  since?: string;
  source?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  kind?: 'article' | 'post';
  minRelevance?: number;
}

export interface MentionAiLineage {
  analyzed: boolean;
  provider?: string;
  model?: string;
  analyzedAt?: string | null;
  sentiment?: string | null;
  sentimentScore?: number | null;
  emotion?: string | null;
  relevance?: number | null;
  relevanceReason?: string | null;
  topics?: string[];
  entities?: string[];
}

export interface MentionExportItem {
  id: number;
  externalId: string;
  source: string;
  kind: 'article' | 'post';
  url: string | null;
  title: string | null;
  content: string;
  articleText?: string | null;
  author: string | null;
  authorHandle: string | null;
  community: string | null;
  publishedAt: string;
  fetchedAt: string;
  language: string | null;
  country: string | null;
  engagement: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  } | null;
  engagementScore: number;
  reach: number | null;
  queryIds: string[];
  ai: MentionAiLineage;
}

export interface CursorPaginationResult<T> {
  items: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface ProjectBenchmarkEntityInput {
  name: string;
  keywords: string[];
  isOwnBrand?: boolean;
}

export interface ProjectProvisionInput {
  monitoringId?: string;
  name: string;
  keywords: string[];
  allTerms?: string[];
  excludeTerms?: string[];
  languages?: string[];
  countries?: string[];
  active?: boolean;
  semanticContext?: string;
  brandVoice?: string;
  telegramChannels?: string[];
  rssFeeds?: string[];
  mode?: 'listening' | 'upload' | 'talkwalker';
  talkwalkerProject?: string;
  talkwalkerTopics?: string[];
  benchmarkEntities?: ProjectBenchmarkEntityInput[];
}

export interface ProjectResponse {
  id: number;
  monitoringId: string | null;
  name: string;
  active: boolean;
  mode: string;
  keywords: string[];
  allTerms: string[];
  excludeTerms: string[];
  languages: string[];
  countries: string[];
  semanticContext: string | null;
  createdAt: string;
  queryPlan?: unknown;
}

export interface CollectionStatusResponse {
  projectId?: number;
  status: 'idle' | 'running' | 'completed' | 'skipped' | 'failed';
  reason?: string;
  lockActive: boolean;
  lastIngestAt: string | null;
  inserted?: number;
  sourceStatus?: Record<string, unknown>;
}

export interface CollectionTriggerInput {
  projectId?: number;
  full?: boolean;
}

export interface AnalyticsSummaryResponse {
  projectId: number;
  windowDays: number;
  kpi: {
    totalMentions: number;
    avgSentiment: number | null;
    activeSources: number;
  };
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
    pending: number;
  };
  volumeByDay: Array<{ day: string; source: string; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
  sourceBreakdown: Array<{ source: string; count: number }>;
}
