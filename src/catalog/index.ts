/**
 * Catalog search engine.
 *
 * Indexes all bl.* and ssh.* methods for the `search` tool.
 * Keyword matching against method names, descriptions, parameters, and tags.
 */

import { methodCatalog, type CatalogEntry } from './methods.js';
import { getMethodDoc, type MethodDoc } from './docs.js';

export { methodCatalog, type CatalogEntry, getMethodDoc, type MethodDoc };

interface ScoredEntry {
  entry: CatalogEntry;
  score: number;
}

/**
 * Search the method catalog. Returns top N matches ranked by relevance.
 */
export function searchCatalog(query: string, maxResults: number = 10): CatalogEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return methodCatalog.slice(0, maxResults);

  const scored: ScoredEntry[] = [];

  for (const entry of methodCatalog) {
    let score = 0;

    const nameLower = entry.name.toLowerCase();
    const descLower = entry.description.toLowerCase();
    const tagsJoined = entry.tags.join(' ').toLowerCase();
    const paramsJoined = entry.parameters.map(p =>
      `${p.name} ${p.type} ${p.description || ''}`
    ).join(' ').toLowerCase();

    for (const term of terms) {
      // Exact name match (highest weight)
      if (nameLower === term || nameLower === `bl.${term}` || nameLower === `ssh.${term}`) {
        score += 100;
      }
      // Name contains term
      else if (nameLower.includes(term)) {
        score += 20;
      }

      // Tag exact match
      if (entry.tags.some(t => t.toLowerCase() === term)) {
        score += 15;
      }
      // Tag partial match
      else if (tagsJoined.includes(term)) {
        score += 8;
      }

      // Description match
      if (descLower.includes(term)) {
        score += 10;
      }

      // Parameter match
      if (paramsJoined.includes(term)) {
        score += 5;
      }
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(s => s.entry);
}

/**
 * Format a catalog entry as a compact string for search results.
 */
export function formatCatalogEntry(entry: CatalogEntry): string {
  const params = entry.parameters
    .map(p => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
    .join(', ');

  const flags: string[] = [];
  if (entry.destructive) flags.push('DESTRUCTIVE');
  if (entry.idempotent) flags.push('idempotent');
  const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';

  return `${entry.name}(${params}) → ${entry.returnType}${flagStr}\n  ${entry.description}`;
}

/**
 * Format detailed documentation for the describe tool.
 */
export function formatMethodDoc(methodName: string): string | null {
  const doc = getMethodDoc(methodName);

  // Fall back to catalog entry if no detailed doc exists
  const catalogEntry = methodCatalog.find(e => e.name === methodName);
  if (!doc && !catalogEntry) return null;

  if (doc) {
    let result = `# ${doc.name}\n\n${doc.fullDescription}\n\n`;
    result += `## Parameters\n${doc.parameterDetails}\n\n`;
    result += `## Returns\n${doc.returnDetails}\n\n`;
    result += `## Examples\n${doc.examples.map(e => '```js\n' + e + '\n```').join('\n\n')}\n`;

    if (doc.gotchas && doc.gotchas.length > 0) {
      result += `\n## Gotchas\n${doc.gotchas.map(g => `- ${g}`).join('\n')}\n`;
    }

    if (doc.relatedMethods && doc.relatedMethods.length > 0) {
      result += `\n## Related\n${doc.relatedMethods.join(', ')}\n`;
    }

    return result;
  }

  // Generate basic docs from catalog entry
  const entry = catalogEntry!;
  let result = `# ${entry.name}\n\n${entry.description}\n\n`;

  if (entry.parameters.length > 0) {
    result += `## Parameters\n`;
    for (const p of entry.parameters) {
      result += `- ${p.name}${p.required ? '' : ' (optional)'}: ${p.type}`;
      if (p.description) result += ` — ${p.description}`;
      result += '\n';
    }
    result += '\n';
  }

  result += `## Returns\n${entry.returnType}\n`;

  const flags: string[] = [];
  if (entry.destructive) flags.push('DESTRUCTIVE');
  if (entry.idempotent) flags.push('Idempotent');
  if (flags.length > 0) result += `\n## Flags\n${flags.join(', ')}\n`;

  return result;
}
