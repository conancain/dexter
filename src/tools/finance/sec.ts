import { parseHTML } from 'linkedom';

export interface FilingMetadata {
  accession_number: string;
  filing_type: string;
  filing_date: string;
  report_date: string;
  document_url: string;
}

let tickerToCikMap: Record<string, string> | null = null;

const DEFAULT_USER_AGENT = 'DexterAgent/1.0 (contact@example.com)';

function getUserAgent(): string {
  return process.env.SEC_USER_AGENT || process.env.USER_AGENT || DEFAULT_USER_AGENT;
}

/**
 * Resolves a stock ticker (e.g. 'AAPL') to its 10-digit CIK string.
 */
export async function getCikForTicker(ticker: string): Promise<string | null> {
  ticker = ticker.toUpperCase().trim();
  
  if (!tickerToCikMap) {
    try {
      const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': getUserAgent() }
      });
      if (!res.ok) {
        throw new Error(`SEC company_tickers request failed: ${res.status}`);
      }
      const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
      tickerToCikMap = {};
      for (const val of Object.values(data)) {
        tickerToCikMap[val.ticker.toUpperCase()] = String(val.cik_str).padStart(10, '0');
      }
    } catch (error) {
      console.error('Error fetching CIK map:', error);
      return null;
    }
  }
  return tickerToCikMap[ticker] || null;
}

/**
 * Retrieves filings list for a ticker.
 */
export async function getFilingsList(
  ticker: string, 
  filingTypes?: string[], 
  limit = 10
): Promise<{ filings: FilingMetadata[]; url: string }> {
  const cik = await getCikForTicker(ticker);
  if (!cik) {
    throw new Error(`Could not resolve ticker "${ticker}" to CIK`);
  }

  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': getUserAgent() }
  });
  if (!res.ok) {
    throw new Error(`SEC submissions request failed for CIK ${cik}: ${res.status}`);
  }

  const data = await res.json() as any;
  const recent = data?.filings?.recent;
  if (!recent || !recent.accessionNumber) {
    return { filings: [], url };
  }

  const list: FilingMetadata[] = [];
  const count = recent.accessionNumber.length;
  const cikNumeric = String(Number(cik));

  for (let i = 0; i < count; i++) {
    const form = recent.form[i];
    
    // Filter by filing types if provided
    if (filingTypes && filingTypes.length > 0 && !filingTypes.includes(form)) {
      continue;
    }

    const acc = recent.accessionNumber[i];
    const accNoDashes = acc.replace(/-/g, '');
    const doc = recent.primaryDocument[i];
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNoDashes}/${doc}`;

    list.push({
      accession_number: acc,
      filing_type: form,
      filing_date: recent.filingDate[i],
      report_date: recent.reportDate[i],
      document_url: docUrl
    });

    if (list.length >= limit) {
      break;
    }
  }

  return { filings: list, url };
}

/**
 * Normalizes item names to standard form for regex matching.
 */
export function normalizeItemName(item: string): { current: string; next: string } {
  const clean = item.toUpperCase().replace(/[-_,]/g, ' ');
  
  if (clean.includes('PART I ITEM 1') || clean === 'PART 1 ITEM 1') {
    return { current: 'Item 1', next: 'Item 2' };
  }
  if (clean.includes('PART I ITEM 2') || clean === 'PART 1 ITEM 2') {
    return { current: 'Item 2', next: 'Item 3' };
  }
  if (clean.includes('PART II ITEM 1A') || clean === 'PART 2 ITEM 1A') {
    return { current: 'Item 1A', next: 'Item 2' };
  }

  // Handle standard 10-K items
  if (clean === 'ITEM 1') return { current: 'Item 1', next: 'Item 1A' };
  if (clean === 'ITEM 1A') return { current: 'Item 1A', next: 'Item 1B' };
  if (clean === 'ITEM 1B') return { current: 'Item 1B', next: 'Item 2' };
  if (clean === 'ITEM 7') return { current: 'Item 7', next: 'Item 7A' };
  if (clean === 'ITEM 7A') return { current: 'Item 7A', next: 'Item 8' };
  if (clean === 'ITEM 8') return { current: 'Item 8', next: 'Item 9' };

  // General numeric item fallback
  const match = clean.match(/ITEM\s*(\d+[A-Z]?)/);
  if (match) {
    const num = match[1];
    const nextNum = num.endsWith('A') ? num.slice(0, -1) + 'B' : String(Number(num) + 1);
    return { current: `Item ${num}`, next: `Item ${nextNum}` };
  }

  return { current: item, next: '' };
}

/**
 * Extracts a specific section between currentItem and nextItem from cleaned text.
 */
export function extractSection(text: string, currentItem: string, nextItem: string): string {
  const normalizedText = text.replace(/\s+/g, ' ');
  
  const getIndices = (item: string) => {
    const escapedItem = item.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedItem}\\b`, 'gi');
    const indices: number[] = [];
    let match;
    while ((match = regex.exec(normalizedText)) !== null) {
      indices.push(match.index);
    }
    return indices;
  };

  const currentIndices = getIndices(currentItem);
  const nextIndices = getIndices(nextItem);

  if (currentIndices.length === 0) {
    return `Section ${currentItem} not found.`;
  }

  let bestStart: number | undefined = undefined;
  let bestEnd: number | undefined = undefined;
  let maxLen = 0;

  for (const cIdx of currentIndices) {
    const suitableEnds = nextIndices.filter(nIdx => nIdx > cIdx);
    if (suitableEnds.length === 0) {
      const candidateLen = normalizedText.length - cIdx;
      if (candidateLen > 2000 && candidateLen > maxLen) {
        bestStart = cIdx;
        bestEnd = cIdx + 100000;
        maxLen = candidateLen;
      }
      continue;
    }
    const nIdx = suitableEnds[0];
    const sliceLen = nIdx - cIdx;
    if (sliceLen > 2000) {
      bestStart = cIdx;
      bestEnd = nIdx;
      break;
    }
  }

  if (bestStart === undefined) {
    bestStart = currentIndices[currentIndices.length - 1];
    const suitableEnds = nextIndices.filter(nIdx => nIdx > bestStart!);
    bestEnd = suitableEnds.length > 0 ? suitableEnds[0] : bestStart + 100000;
  }

  return normalizedText.substring(bestStart, bestEnd).trim();
}

/**
 * Fetches and parses sections of a filing document.
 */
export async function getFilingSectionText(
  ticker: string,
  accessionNumber: string,
  filingType: string,
  items?: string[]
): Promise<{ data: Record<string, string>; url: string }> {
  const cik = await getCikForTicker(ticker);
  if (!cik) {
    throw new Error(`Could not resolve ticker "${ticker}" to CIK`);
  }

  // 1. Fetch submission list to identify the primary document filename
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const subRes = await fetch(submissionsUrl, {
    headers: { 'User-Agent': getUserAgent() }
  });
  if (!subRes.ok) {
    throw new Error(`SEC submissions request failed: ${subRes.status}`);
  }
  const subData = await subRes.json() as any;
  const recent = subData?.filings?.recent;
  
  let primaryDoc = '';
  if (recent && recent.accessionNumber) {
    const idx = recent.accessionNumber.indexOf(accessionNumber);
    if (idx !== -1) {
      primaryDoc = recent.primaryDocument[idx];
    }
  }

  if (!primaryDoc) {
    // If not found in recent, default guess standard primary doc names
    primaryDoc = `${ticker.toLowerCase()}-${filingType.toLowerCase().replace('-', '')}.htm`;
  }

  const cikNumeric = String(Number(cik));
  const accNoDashes = accessionNumber.replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accNoDashes}/${primaryDoc}`;

  // 2. Fetch the actual HTML file
  const docRes = await fetch(url, {
    headers: { 'User-Agent': getUserAgent() }
  });
  if (!docRes.ok) {
    throw new Error(`SEC document request failed: ${docRes.status}`);
  }

  const html = await docRes.text();
  
  // 3. Convert HTML to plain text
  const { document } = parseHTML(html);
  const scripts = document.querySelectorAll('script, style');
  scripts.forEach(s => s.remove());
  const rawText = document.body ? document.body.textContent || '' : document.documentElement.textContent || '';
  
  const result: Record<string, string> = {};

  if (!items || items.length === 0) {
    // Return full text capped at 100k
    result['Full'] = rawText.replace(/\s+/g, ' ').substring(0, 100000).trim();
  } else {
    for (const item of items) {
      const { current, next } = normalizeItemName(item);
      if (next) {
        result[item] = extractSection(rawText, current, next);
      } else {
        result[item] = rawText.replace(/\s+/g, ' ').substring(0, 50000).trim(); // fallback
      }
    }
  }

  return { data: result, url };
}
