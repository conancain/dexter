import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { runYahooBridge } from './yahoo.js';
import { formatToolResult } from '../types.js';

const InstitutionalHoldingsInputSchema = z
  .object({
    ticker: z
      .string()
      .optional()
      .describe("The held-security ticker (e.g. 'AAPL') to find all institutional filers holding it. Provide ticker for 'who holds X' questions."),
    filer_name: z
      .string()
      .optional()
      .describe("Institutional filer name (not supported in free migration)."),
    filer_cik: z
      .string()
      .optional()
      .describe("Institutional CIK (not supported in free migration)."),
    limit: z
      .number()
      .default(10)
      .describe('Maximum positions to return (default: 10, max: 200).'),
  });

export const getInstitutionalHoldings = new DynamicStructuredTool({
  name: 'get_institutional_holdings',
  description: `Retrieves institutional holdings. Note: Manager portfolio lookup (e.g., 'what does Citadel hold') is not supported in the free version; only ticker mode is supported (e.g., 'who holds AAPL').`,
  schema: InstitutionalHoldingsInputSchema,
  func: async (input) => {
    if (input.filer_name || input.filer_cik) {
      return formatToolResult(
        { error: 'Institutional manager portfolio search (e.g. what does Citadel hold?) is not supported by the free Yahoo Finance integration. Please query by ticker instead (e.g. who holds AAPL?).' },
        []
      );
    }

    if (!input.ticker) {
      return formatToolResult(
        { error: 'Please provide a ticker symbol (e.g. AAPL) to see its institutional holders.' },
        []
      );
    }

    const ticker = input.ticker.toUpperCase().trim();
    const data = runYahooBridge('holders', ticker, [String(input.limit)]);
    const url = `https://finance.yahoo.com/quote/${ticker}/holders`;
    return formatToolResult(data.institutional_holdings || [], [url]);
  },
});

export const getInstitutionalInvestors = new DynamicStructuredTool({
  name: 'get_institutional_investors',
  description: `Look up institutional filers. (Deprecated in free migration).`,
  schema: z.object({ name: z.string().optional() }),
  func: async () => {
    return formatToolResult(
      { error: 'Filer name lookup is deprecated in the free Yahoo Finance integration.' },
      []
    );
  },
});

