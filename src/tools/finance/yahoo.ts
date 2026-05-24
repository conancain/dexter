import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BRIDGE_PATH = join(__dirname, 'yahoo_bridge.py');

export interface YahooResponse {
  [key: string]: any;
}

/**
 * Executes the Python yahoo_bridge.py helper script.
 */
export function runYahooBridge(action: string, ticker: string, args: string[] = []): YahooResponse {
  try {
    const pythonExe = 'python.exe';
    const procArgs = [BRIDGE_PATH, action, ticker, ...args];
    const stdout = execFileSync(pythonExe, procArgs, { 
      encoding: 'utf8', 
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024 // 10MB max buffer for larger responses
    });
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Yahoo bridge execution failed: ${message}` };
  }
}
