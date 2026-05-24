import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

const FinancialSegmentsInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The stock ticker symbol to fetch financial segments for. For example, 'AAPL' for Apple."
    ),
  period: z
    .enum(['annual', 'quarterly'])
    .describe(
      "The reporting period for the financial segments. 'annual' for yearly, 'quarterly' for quarterly."
    ),
  limit: z.number().default(4).describe('The number of past periods to retrieve.'),
});

export const getFinancialSegments = new DynamicStructuredTool({
  name: 'get_financial_segments',
  description: `Provides a detailed breakdown of a company's financials by operating segments. (Deprecated under Yahoo Finance migration).`,
  schema: FinancialSegmentsInputSchema,
  func: async (input) => {
    return formatToolResult(
      { error: 'Operating segment breakdowns (by product line or geography) are not supported on the free Yahoo Finance integration.' },
      []
    );
  },
});

