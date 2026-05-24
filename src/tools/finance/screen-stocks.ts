import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

export const SCREEN_STOCKS_DESCRIPTION = `
Screens for stocks matching financial criteria. (Deprecated under Yahoo Finance migration).
`.trim();

const ScreenStocksInputSchema = z.object({
  query: z.string().describe('Natural language query describing stock screening criteria'),
});

export const createScreenStocks = (model: string): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'stock_screener',
    description: `Screens for stocks matching financial criteria. (Deprecated under Yahoo Finance migration).`,
    schema: ScreenStocksInputSchema,
    func: async (input) => {
      return formatToolResult(
        { error: 'Arbitrary multi-metric stock screening is not supported on the free Yahoo Finance integration. Please search for individual tickers directly.' },
        []
      );
    },
  });
};

