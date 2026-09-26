import { z } from 'zod';

export const cursorMentionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  since: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
  source: z.string().trim().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  kind: z.enum(['article', 'post']).optional(),
  minRelevance: z.coerce.number().int().min(1).max(5).optional(),
});

export const projectBenchmarkEntitySchema = z.object({
  name: z.string().trim().min(1),
  keywords: z.array(z.string().trim().min(1)).default([]),
  isOwnBrand: z.boolean().optional().default(false),
});

export const projectProvisionSchema = z.object({
  monitoringId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, 'Project name is required').max(200),
  keywords: z.array(z.string().trim().min(1)).min(1, 'At least one keyword is required'),
  allTerms: z.array(z.string().trim().min(1)).optional().default([]),
  excludeTerms: z.array(z.string().trim().min(1)).optional().default([]),
  languages: z.array(z.string().trim().min(2)).optional().default(['en']),
  countries: z.array(z.string().trim().length(2)).optional().default([]),
  active: z.boolean().optional().default(true),
  semanticContext: z.string().trim().optional(),
  brandVoice: z.string().trim().optional(),
  telegramChannels: z.array(z.string().trim()).optional().default([]),
  rssFeeds: z.array(z.string().url()).optional().default([]),
  mode: z.enum(['listening', 'upload', 'talkwalker']).optional().default('listening'),
  talkwalkerProject: z.string().trim().optional(),
  talkwalkerTopics: z.array(z.string().trim()).optional().default([]),
  benchmarkEntities: z.array(projectBenchmarkEntitySchema).optional().default([]),
});

export const projectUpdateSchema = projectProvisionSchema.partial();

export const collectTriggerSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  full: z.boolean().optional().default(false),
});
