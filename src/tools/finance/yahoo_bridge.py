import sys
import json
import yfinance as yf
import pandas as pd
from datetime import datetime

def format_date(dt):
    if pd.isna(dt):
        return None
    if isinstance(dt, (int, float)):
        dt = pd.to_datetime(dt, unit='s')
    elif isinstance(dt, str):
        dt = pd.to_datetime(dt)
    return dt.strftime('%Y-%m-%d')

def get_row_value(df, possible_names):
    for name in possible_names:
        if name in df.index:
            return df.loc[name]
    return pd.Series(dtype='float64')

def get_quote(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info
    snapshot = {
        'ticker': ticker_symbol,
        'close': info.get('previousClose') or info.get('currentPrice') or info.get('regularMarketPreviousClose'),
        'price': info.get('currentPrice') or info.get('regularMarketPrice'),
        'open': info.get('regularMarketOpen') or info.get('open'),
        'high': info.get('regularMarketDayHigh') or info.get('dayHigh') or info.get('high'),
        'low': info.get('regularMarketDayLow') or info.get('dayLow') or info.get('low'),
        'volume': info.get('regularMarketVolume') or info.get('volume'),
        'market_cap': info.get('marketCap')
    }
    return {'snapshot': snapshot}

def get_history(ticker_symbol, start_date, end_date, interval):
    # Map interval from day/week/month/year to yfinance format (1d, 1wk, 1mo, 1y)
    interval_map = {
        'day': '1d', 'week': '1wk', 'month': '1mo', 'year': '1y',
        'minute': '1m', '1d': '1d', '1wk': '1wk', '1mo': '1mo', '1y': '1y'
    }
    yf_interval = interval_map.get(interval, '1d')
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.history(start=start_date, end=end_date, interval=yf_interval)
    prices = []
    for idx, row in df.iterrows():
        prices.append({
            'date': format_date(idx),
            'open': float(row['Open']) if not pd.isna(row['Open']) else None,
            'high': float(row['High']) if not pd.isna(row['High']) else None,
            'low': float(row['Low']) if not pd.isna(row['Low']) else None,
            'close': float(row['Close']) if not pd.isna(row['Close']) else None,
            'volume': int(row['Volume']) if not pd.isna(row['Volume']) else None
        })
    return {'prices': prices}

def get_financials(ticker_symbol, period, limit=4):
    ticker = yf.Ticker(ticker_symbol)
    is_quarterly = period == 'quarterly'
    
    income = ticker.quarterly_income_stmt if is_quarterly else ticker.income_stmt
    balance = ticker.quarterly_balance_sheet if is_quarterly else ticker.balance_sheet
    cashflow = ticker.quarterly_cashflow if is_quarterly else ticker.cashflow

    # Find common report periods (columns)
    periods = []
    if not income.empty:
        periods = [c for c in income.columns]
    elif not balance.empty:
        periods = [c for c in balance.columns]
    elif not cashflow.empty:
        periods = [c for c in cashflow.columns]

    # Convert columns to string representation
    periods = sorted(periods, reverse=True)[:limit]

    income_statements = []
    balance_sheets = []
    cash_flow_statements = []

    for p in periods:
        p_str = format_date(p)
        
        # 1. Income Statement
        if not income.empty and p in income.columns:
            col = income[p]
            income_statements.append({
                'report_period': p_str,
                'revenue': float(col.get('Total Revenue')) if pd.notna(col.get('Total Revenue')) else None,
                'operating_income': float(col.get('Operating Income')) if pd.notna(col.get('Operating Income')) else None,
                'net_income': float(col.get('Net Income')) if pd.notna(col.get('Net Income')) else None,
                'earnings_per_share': float(col.get('Basic EPS')) if pd.notna(col.get('Basic EPS')) else (
                    float(col.get('Diluted EPS')) if pd.notna(col.get('Diluted EPS')) else None
                )
            })

        # 2. Balance Sheet
        if not balance.empty and p in balance.columns:
            col = balance[p]
            balance_sheets.append({
                'report_period': p_str,
                'total_assets': float(col.get('Total Assets')) if pd.notna(col.get('Total Assets')) else None,
                'total_liabilities': float(col.get('Total Liabilities Net Minority Interest')) if pd.notna(col.get('Total Liabilities Net Minority Interest')) else (
                    float(col.get('Total Liabilities')) if pd.notna(col.get('Total Liabilities')) else None
                ),
                'shareholders_equity': float(col.get('Stockholders Equity')) if pd.notna(col.get('Stockholders Equity')) else (
                    float(col.get('Total Equity Gross Minority Interest')) if pd.notna(col.get('Total Equity Gross Minority Interest')) else None
                ),
                'cash_and_equivalents': float(col.get('Cash And Cash Equivalents')) if pd.notna(col.get('Cash And Cash Equivalents')) else (
                    float(col.get('Cash Cash Equivalents And Short Term Investments')) if pd.notna(col.get('Cash Cash Equivalents And Short Term Investments')) else None
                )
            })

        # 3. Cash Flow Statement
        if not cashflow.empty and p in cashflow.columns:
            col = cashflow[p]
            cash_flow_statements.append({
                'report_period': p_str,
                'operating_cash_flow': float(col.get('Operating Cash Flow')) if pd.notna(col.get('Operating Cash Flow')) else (
                    float(col.get('Cash Flow From Continuing Operating Activities')) if pd.notna(col.get('Cash Flow From Continuing Operating Activities')) else None
                ),
                'capital_expenditure': float(col.get('Capital Expenditure')) if pd.notna(col.get('Capital Expenditure')) else (
                    float(col.get('Net Single Purchase Of Productive Assets')) if pd.notna(col.get('Net Single Purchase Of Productive Assets')) else None
                )
            })

    return {
        'income_statements': income_statements,
        'balance_sheets': balance_sheets,
        'cash_flow_statements': cash_flow_statements,
        'financials': {
            'income_statements': income_statements,
            'balance_sheets': balance_sheets,
            'cash_flow_statements': cash_flow_statements
        }
    }

def get_key_ratios(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info
    
    snapshot = {
        'ticker': ticker_symbol,
        'market_cap': info.get('marketCap'),
        'pe_ratio': info.get('trailingPE') or info.get('forwardPE'),
        'eps': info.get('trailingEps'),
        'revenue_growth_rate': info.get('revenueGrowth'),
        'earnings_growth_rate': info.get('earningsGrowth'),
        'gross_margin': info.get('grossMargins'),
        'operating_margin': info.get('operatingMargins'),
        'net_margin': info.get('profitMargins'),
        'roe': info.get('returnOnEquity'),
        'roic': info.get('returnOnAssets'), # Fallback
        'dividend_yield': info.get('dividendYield'),
        'debt_to_equity': info.get('debtToEquity')
    }
    
    # Calculate historical ratios by merging financials
    financials = get_financials(ticker_symbol, 'annual', limit=4)
    income_list = financials['income_statements']
    balance_list = financials['balance_sheets']
    
    financial_metrics = []
    for inc in income_list:
        p_str = inc['report_period']
        bal = next((b for b in balance_list if b['report_period'] == p_str), None)
        
        pe = None
        # Try to fetch historical close price near report period to estimate historical PE
        try:
            p_dt = pd.to_datetime(p_str)
            p_start = (p_dt - pd.Timedelta(days=5)).strftime('%Y-%m-%d')
            p_end = (p_dt + pd.Timedelta(days=5)).strftime('%Y-%m-%d')
            hist = ticker.history(start=p_start, end=p_end)
            if not hist.empty and inc.get('earnings_per_share'):
                close_price = hist.iloc[-1]['Close']
                pe = close_price / inc['earnings_per_share']
        except Exception:
            pass

        metrics = {
            'report_period': p_str,
            'pe_ratio': round(pe, 2) if pe else None,
            'eps': inc.get('earnings_per_share'),
            'revenue_growth_rate': snapshot.get('revenue_growth_rate'), # approximation
            'operating_margin': (inc['operating_income'] / inc['revenue']) if (inc.get('operating_income') and inc.get('revenue')) else None,
            'roe': (inc['net_income'] / bal['shareholders_equity']) if (inc.get('net_income') and bal and bal.get('shareholders_equity')) else None,
        }
        financial_metrics.append(metrics)

    return {
        'snapshot': snapshot,
        'financial_metrics': financial_metrics
    }

def get_insider(ticker_symbol, limit=10):
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.insider_transactions
    insider_trades = []
    if df is not None and not df.empty:
        df = df.iloc[:limit]
        for index, row in df.iterrows():
            shares = float(row['Shares']) if pd.notna(row.get('Shares')) else 0
            val = float(row['Value']) if pd.notna(row.get('Value')) else 0
            price = (val / shares) if shares > 0 else None
            
            insider_trades.append({
                'full_name': str(row.get('Insider', 'Unknown')),
                'officer_title': str(row.get('Position', 'Insider')),
                'transaction_type': str(row.get('Transaction', 'Trade')),
                'shares': shares,
                'price_per_share': price,
                'filing_date': format_date(row.get('Start Date'))
            })
    return {'insider_trades': insider_trades}

def get_holders(ticker_symbol, limit=10):
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.institutional_holders
    institutional_holdings = []
    if df is not None and not df.empty:
        df = df.iloc[:limit]
        for index, row in df.iterrows():
            institutional_holdings.append({
                'filer_name': str(row.get('Holder', 'Unknown')),
                'shares': float(row.get('Shares')) if pd.notna(row.get('Shares')) else 0,
                'value_usd': float(row.get('Value')) if pd.notna(row.get('Value')) else 0,
                'report_period': format_date(row.get('Date Reported'))
            })
    return {'institutional_holdings': institutional_holdings}

def get_news(ticker_symbol, limit=5):
    ticker = yf.Ticker(ticker_symbol)
    raw_news = ticker.news or []
    news = []
    for item in raw_news[:limit]:
        content = item.get('content', {})
        news.append({
            'title': content.get('title') or item.get('title'),
            'source': (content.get('provider') or {}).get('displayName') or item.get('publisher'),
            'date': content.get('pubDate') or item.get('providerPublishTime'),
            'url': content.get('canonicalUrl', {}).get('url') or item.get('link')
        })
    return {'news': news}

def get_earnings(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info
    
    # yfinance calendar dates
    calendar = ticker.calendar
    earnings_date = None
    if isinstance(calendar, dict) and 'Earnings Date' in calendar:
        dates = calendar['Earnings Date']
        if dates and len(dates) > 0:
            earnings_date = format_date(dates[0])
            
    # Default figures
    earnings_snapshot = {
        'ticker': ticker_symbol,
        'report_period': earnings_date or datetime.today().strftime('%Y-%m-%d'),
        'fiscal_period': 'Q' + str((datetime.today().month - 1) // 3 + 1),
        'currency': info.get('currency', 'USD'),
        'filing_date': datetime.today().strftime('%Y-%m-%d'),
        'source_type': 'Yahoo Calendar',
        'quarterly': {
            'revenue': info.get('totalRevenue'),
            'net_income': info.get('netIncomeToCommon'),
            'eps': info.get('trailingEps'),
            'revenue_surprise': None,
            'eps_surprise': None
        }
    }
    return {'earnings': [earnings_snapshot]}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Missing arguments. Usage: python yahoo_bridge.py <action> <ticker> [args]'}))
        sys.exit(1)

    action = sys.argv[1]
    ticker = sys.argv[2]

    try:
        if action == 'quote':
            res = get_quote(ticker)
        elif action == 'history':
            start = sys.argv[3] if len(sys.argv) > 3 else None
            end = sys.argv[4] if len(sys.argv) > 4 else None
            interval = sys.argv[5] if len(sys.argv) > 5 else 'day'
            res = get_history(ticker, start, end, interval)
        elif action == 'financials':
            period = sys.argv[3] if len(sys.argv) > 3 else 'annual'
            limit = int(sys.argv[4]) if len(sys.argv) > 4 else 4
            res = get_financials(ticker, period, limit)
        elif action == 'key_ratios':
            res = get_key_ratios(ticker)
        elif action == 'insider':
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            res = get_insider(ticker, limit)
        elif action == 'holders':
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            res = get_holders(ticker, limit)
        elif action == 'news':
            limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
            res = get_news(ticker, limit)
        elif action == 'earnings':
            res = get_earnings(ticker)
        else:
            res = {'error': f'Unknown action: {action}'}
        
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({'error': str(e)}))

if __name__ == '__main__':
    main()
