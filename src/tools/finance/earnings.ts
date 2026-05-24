import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { runYahooBridge } from './yahoo.js';
import { formatToolResult } from '../types.js';

const EarningsInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch the latest earnings for. For example, 'AAPL' for Apple."),
});

export const getEarnings = new DynamicStructuredTool({
  name: 'get_earnings',
  description:
    'Fetches the most recent earnings snapshot for a company, including key income statement, balance sheet, and cash flow figures from the 8-K earnings release.',
  schema: EarningsInputSchema,
  func: async (input) => {
    const ticker = input.ticker.trim().toUpperCase();
    const data = runYahooBridge('earnings', ticker);
    const record = Array.isArray(data?.earnings) ? data.earnings[0] : null;
    const url = `https://finance.yahoo.com/quote/${ticker}`;
    return formatToolResult(record || {}, [url]);
  },
});

