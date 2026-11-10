// Optional Elastic adapter. It uses Elastic's REST API directly so the app keeps working
// without an Elastic package or an Elastic account. Indexing is fire-and-forget; search is
// read-only and returns an empty set when the sponsor integration is not configured.

import type { Assessment } from '../agent/assessment';
import { POLICY, type PolicyTopic } from '../store/policy';

export type SimilarCase = {
  id: string;
  complaintType: string | null;
  outcome: string | null;
  summary: string;
  score: number;
};

type SearchDocument = {
  kind: 'case' | 'policy';
  caseId?: string;
  topic?: PolicyTopic;
  complaint?: string;
  complaintType?: string;
  outcome?: string | null;
  summary?: string;
  lines?: string[];
};

export const elasticConfigured = () => Boolean(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY);
const baseUrl = () => `${process.env.ELASTIC_URL!.replace(/\/$/, '')}/${process.env.ELASTIC_INDEX ?? 'resolve'}`;
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `ApiKey ${process.env.ELASTIC_API_KEY}` });
let indexReady: Promise<void> | undefined;
let policiesReady: Promise<void> | undefined;

async function elastic(path: string, init: RequestInit = {}) {
  if (!elasticConfigured()) return null;
  try {
    return await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(5000) });
  } catch (error) {
    console.warn('Elastic request failed', error);
    return null;
  }
}

async function responseJson<T>(response: Response | null): Promise<T | null> {
  if (!response?.ok) return null;
  try {
    return (await response.json()) as T;
  } catch (error) {
    console.warn('Elastic returned invalid JSON', error);
    return null;
  }
}

async function ensureIndex(): Promise<void> {
  if (!elasticConfigured()) return;
  indexReady ??= (async () => {
    await elastic('', {
      method: 'PUT',
      body: JSON.stringify({
        mappings: {
          properties: {
            kind: { type: 'keyword' },
            caseId: { type: 'keyword' },
            topic: { type: 'keyword' },
            complaintType: { type: 'keyword' },
            outcome: { type: 'keyword' },
            complaint: { type: 'text' },
            summary: { type: 'text' },
            lines: { type: 'text' },
          },
        },
      }),
    });
  })();
  await indexReady;
}

export async function indexCase(document: {
  caseId: string;
  complaint: string;
  assessment: Assessment;
  outcome: string;
  summary: string;
}): Promise<void> {
  if (!elasticConfigured()) return;
  await ensureIndex();
  const body: SearchDocument = {
    kind: 'case',
    caseId: document.caseId,
    complaint: document.complaint,
    complaintType: document.assessment.complaintType,
    outcome: document.outcome,
    summary: document.summary,
  };
  await elastic(`/case-${document.caseId}`, { method: 'PUT', body: JSON.stringify(body) });
}

async function indexPolicies(): Promise<void> {
  policiesReady ??= (async () => {
    await ensureIndex();
    for (const [topic, lines] of Object.entries(POLICY)) {
      await elastic(`/policy-${topic}`, { method: 'PUT', body: JSON.stringify({ kind: 'policy', topic, lines }) });
    }
  })();
  await policiesReady;
}

export async function findSimilarCases(query: string, complaintType?: string): Promise<SimilarCase[]> {
  if (!elasticConfigured() || !query.trim()) return [];
  await ensureIndex();
  const response = await elastic('/_search', {
    method: 'POST',
    body: JSON.stringify({
      size: 3,
      query: {
        bool: {
          must: [{ multi_match: { query, fields: ['complaint^3', 'summary', 'complaintType'] } }],
          filter: [{ term: { kind: 'case' } }],
          should: complaintType ? [{ term: { complaintType: { value: complaintType, boost: 2 } } }] : [],
        },
      },
    }),
  });
  const data = await responseJson<{ hits?: { hits?: { _score?: number; _source?: SearchDocument }[] } }>(response);
  if (!data) return [];
  return (data.hits?.hits ?? []).flatMap((hit) =>
    hit._source?.kind === 'case' && hit._source.caseId
      ? [{ id: hit._source.caseId, complaintType: hit._source.complaintType ?? null, outcome: hit._source.outcome ?? null, summary: hit._source.summary ?? '', score: hit._score ?? 0 }]
      : [],
  );
}

export async function hybridPolicy(topic: string, query?: string): Promise<string[]> {
  if (!elasticConfigured()) return [];
  await indexPolicies();
  const response = await elastic('/_search', {
    method: 'POST',
    body: JSON.stringify({
      size: 1,
      query: { bool: { must: [{ term: { kind: 'policy' } }, ...(query ? [{ match: { lines: query } }] : [])], filter: [{ term: { topic } }] } },
    }),
  });
  const data = await responseJson<{ hits?: { hits?: { _source?: SearchDocument }[] } }>(response);
  if (!data) return [];
  return data.hits?.hits?.[0]?._source?.lines ?? [];
}
