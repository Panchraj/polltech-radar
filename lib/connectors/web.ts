import type { Connector, ListeningQuery, RawMention } from './types';
import { fetchText, stripHtml, truncate } from './util';

export interface ApprovedWebTarget {
  url: string;
  approvalId: string;
  approvedBy: string;
  approvedAt: string;
  titleSelector?: string;
  contentSelector?: string;
}

let approvedTargets: ApprovedWebTarget[] = [];

/**
 * Configures the approved public web targets for the current collection cycle.
 * In accordance with E5 policy: only approved public sites are queried.
 * Never bypasses authentication, CAPTCHAs, or platform access restrictions.
 */
export function setApprovedWebTargets(targets: ApprovedWebTarget[]): void {
  approvedTargets = targets.filter((t) => /^https?:\/\//i.test(t.url.trim()));
}

export const genericWeb: Connector = {
  id: 'generic_web',
  label: 'Approved Web',
  tier: 'free',
  enabled: () => approvedTargets.length > 0,
  disabledReason: 'No approved public web targets configured for this project.',
  async fetchMentions(q: ListeningQuery): Promise<RawMention[]> {
    if (approvedTargets.length === 0) return [];

    const mentions: RawMention[] = [];
    const searchTerms = [...q.anyTerms, ...q.allTerms].map((t) => t.toLowerCase());

    for (const target of approvedTargets.slice(0, 5)) {
      try {
        const html = await fetchText(target.url);
        if (!html) continue;

        // Basic clean HTML title extraction
        const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
        const title = titleMatch ? stripHtml(titleMatch[1]).trim() : '';

        // Extract text from paragraphs
        const paragraphs: string[] = [];
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
        let match: RegExpExecArray | null;
        while ((match = pRegex.exec(html)) !== null && paragraphs.length < 15) {
          const cleanP = stripHtml(match[1]).trim();
          if (cleanP.length > 20) {
            paragraphs.push(cleanP);
          }
        }

        const body = paragraphs.join('\n\n');
        const fullContent = `${title}\n${body}`.toLowerCase();

        // Check if page matches search terms
        const matches = searchTerms.length === 0 || searchTerms.some((t) => fullContent.includes(t));
        if (!matches) continue;

        const urlObj = new URL(target.url);
        const host = urlObj.host.replace(/^www\./, '');

        mentions.push({
          source: 'generic_web',
          externalId: `web:${target.url}`,
          url: target.url,
          title: title || host,
          content: truncate(body || title, 2000),
          publishedAt: new Date(),
          community: host,
        });
      } catch (err) {
        console.warn(`[connector:web] failed to fetch approved target "${target.url}":`, err);
      }
    }

    return mentions;
  },
};
