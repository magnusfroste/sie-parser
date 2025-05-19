import json
from datetime import datetime
from collections import defaultdict

def process_for_llm(sie_data):
    """
    Process SIE data to make it more suitable for LLM analysis.
    Handles large transaction sets by creating summaries and aggregations.
    """
    processed_data = {
        'metadata': sie_data['metadata'],
        'summary': create_summary(sie_data),
        'accounts': sie_data['accounts'],
        'balance_sheet': create_balance_sheet(sie_data),
        'income_statement': create_income_statement(sie_data),
        'transaction_samples': sample_transactions(sie_data, max_samples=20),
        'transaction_count': count_transactions(sie_data),
        'ib': sie_data['ib'],  # Include opening balance data
        'ub': sie_data['ub'],  # Include closing balance data
        'res': sie_data['res']  # Include result data
    }
    
    # Only include full transaction list if it's not too large
    if processed_data['transaction_count'] <= 500:
        processed_data['all_transactions'] = sie_data['verifications']
    else:
        processed_data['transaction_aggregates'] = aggregate_transactions(sie_data)
    
    return processed_data

def add_description(data, description):
    """Add user description to the data to make it more LLM-friendly."""
    enhanced_data = data.copy()
    enhanced_data['user_description'] = description
    
    # Add analysis hints based on the description
    keywords = extract_keywords(description)
    enhanced_data['analysis_hints'] = {
        'keywords': keywords,
        'focus_areas': identify_focus_areas(keywords, data)
    }
    
    return enhanced_data

def create_summary(sie_data):
    """Create a summary of the SIE data."""
    summary = {
        'company_name': sie_data['metadata'].get('company_name', 'Unknown'),
        'period': get_period_string(sie_data),
        'total_accounts': len(sie_data['accounts']),
        'total_verifications': len(sie_data['verifications']),
        'total_transactions': count_transactions(sie_data),
        'account_types': count_account_types(sie_data)
    }
    
    # Add financial totals
    income_total, expense_total = calculate_income_expense_totals(sie_data)
    summary['total_income'] = income_total
    summary['total_expenses'] = expense_total
    summary['net_result'] = income_total - expense_total
    
    return summary

def get_period_string(sie_data):
    """Get a string representation of the accounting period."""
    if 'fiscal_years' in sie_data['metadata']:
        years = sie_data['metadata']['fiscal_years']
        if years:
            # Get the first fiscal year (usually there's only one in SIE4)
            year_id = next(iter(years))
            year_data = years[year_id]
            
            start = year_data.get('start_date', 'Unknown')
            end = year_data.get('end_date', 'Unknown')
            
            return f"{start} to {end}"
    
    return "Unknown period"

def count_transactions(sie_data):
    """Count the total number of transactions."""
    count = 0
    for ver in sie_data['verifications']:
        count += len(ver['transactions'])
    return count

def count_account_types(sie_data):
    """Count the number of accounts by type."""
    type_counts = defaultdict(int)
    
    for account_number, account_data in sie_data['accounts'].items():
        account_type = account_data.get('type', 'unknown')
        type_counts[account_type] += 1
    
    return dict(type_counts)

def calculate_income_expense_totals(sie_data):
    """Calculate total income and expenses."""
    income_total = 0
    expense_total = 0
    
    # Use account totals if available
    if 'account_totals' in sie_data:
        for account, amount in sie_data['account_totals'].items():
            if account in sie_data['accounts']:
                account_type = sie_data['accounts'][account].get('type', '')
                
                if account_type == 'income_statement':
                    # In Swedish accounting, income accounts typically have negative values
                    # and expense accounts have positive values
                    account_int = int(account)
                    if 3000 <= account_int < 4000:  # Income
                        income_total -= amount  # Negate to get positive income
                    elif 4000 <= account_int < 8000:  # Expenses
                        expense_total += amount
    
    return income_total, expense_total

def create_balance_sheet(sie_data):
    """Create a balance sheet from the SIE data."""
    balance_sheet = {
        'assets': {},
        'liabilities': {},
        'equity': {}
    }
    
    # Use UB (closing balance) if available, otherwise calculate from transactions
    year = next(iter(sie_data['ub'])) if sie_data['ub'] else None
    
    if year and year in sie_data['ub']:
        for account, amount in sie_data['ub'][year].items():
            if account in sie_data['accounts']:
                account_type = sie_data['accounts'][account].get('type', '')
                account_name = sie_data['accounts'][account].get('name', 'Unknown')
                
                if account_type == 'asset':
                    balance_sheet['assets'][account] = {
                        'name': account_name,
                        'amount': amount
                    }
                elif account_type in ['liability', 'equity_or_liability']:
                    if int(account) < 2900:  # Typical division in Swedish accounting
                        balance_sheet['liabilities'][account] = {
                            'name': account_name,
                            'amount': amount
                        }
                    else:
                        balance_sheet['equity'][account] = {
                            'name': account_name,
                            'amount': amount
                        }
    
    # Calculate totals
    balance_sheet['total_assets'] = sum(item['amount'] for item in balance_sheet['assets'].values())
    balance_sheet['total_liabilities'] = sum(item['amount'] for item in balance_sheet['liabilities'].values())
    balance_sheet['total_equity'] = sum(item['amount'] for item in balance_sheet['equity'].values())
    
    return balance_sheet

def create_income_statement(sie_data):
    """Create an income statement from the SIE data."""
    income_statement = {
        'income': {},
        'expenses': {}
    }
    
    # Use RES (result) if available, otherwise calculate from transactions
    year = next(iter(sie_data['res'])) if sie_data['res'] else None
    
    if year and year in sie_data['res']:
        for account, amount in sie_data['res'][year].items():
            if account in sie_data['accounts']:
                account_int = int(account)
                account_name = sie_data['accounts'][account].get('name', 'Unknown')
                
                if 3000 <= account_int < 4000:  # Income
                    income_statement['income'][account] = {
                        'name': account_name,
                        'amount': -amount  # Negate to get positive income
                    }
                elif 4000 <= account_int < 8000:  # Expenses
                    income_statement['expenses'][account] = {
                        'name': account_name,
                        'amount': amount
                    }
    
    # Calculate totals
    income_statement['total_income'] = sum(item['amount'] for item in income_statement['income'].values())
    income_statement['total_expenses'] = sum(item['amount'] for item in income_statement['expenses'].values())
    income_statement['net_result'] = income_statement['total_income'] - income_statement['total_expenses']
    
    return income_statement

def sample_transactions(sie_data, max_samples=20):
    """Sample a limited number of transactions for LLM analysis."""
    all_transactions = []
    
    for ver in sie_data['verifications']:
        for trans in ver['transactions']:
            all_transactions.append({
                'verification': f"{ver['series']}{ver['number']}",
                'date': trans['date'],
                'account': trans['account'],
                'account_name': trans.get('account_name', 'Unknown'),
                'amount': trans['amount'],
                'text': trans['text'] or ver['text']
            })
    
    # If we have fewer transactions than the max, return all of them
    if len(all_transactions) <= max_samples:
        return all_transactions
    
    # Otherwise, sample transactions from different parts of the dataset
    sampled = []
    step = len(all_transactions) // max_samples
    
    for i in range(0, len(all_transactions), step):
        if len(sampled) < max_samples:
            sampled.append(all_transactions[i])
    
    return sampled

def aggregate_transactions(sie_data):
    """Aggregate transactions by account and month for large datasets."""
    aggregates = defaultdict(lambda: defaultdict(float))
    
    for ver in sie_data['verifications']:
        for trans in ver['transactions']:
            account = trans['account']
            amount = trans['amount']
            
            # Extract month from date (format: YYYYMMDD)
            date = trans['date']
            if len(date) >= 6:
                month_key = date[:6]  # YYYYMM
            else:
                month_key = 'unknown'
            
            aggregates[account][month_key] += amount
    
    # Convert to regular dict for JSON serialization
    result = {}
    for account, months in aggregates.items():
        account_name = "Unknown"
        if account in sie_data['accounts']:
            account_name = sie_data['accounts'][account].get('name', 'Unknown')
        
        result[account] = {
            'name': account_name,
            'monthly_totals': dict(months),
            'total': sum(months.values())
        }
    
    return result

def extract_keywords(description):
    """Extract potential keywords from user description."""
    # Simple keyword extraction - in a real app, this could be more sophisticated
    common_words = {'and', 'the', 'to', 'a', 'in', 'for', 'of', 'with', 'on', 'at'}
    words = description.lower().split()
    keywords = [word for word in words if len(word) > 3 and word not in common_words]
    
    # Remove duplicates while preserving order
    unique_keywords = []
    for kw in keywords:
        if kw not in unique_keywords:
            unique_keywords.append(kw)
    
    return unique_keywords[:10]  # Limit to top 10 keywords

def identify_focus_areas(keywords, data):
    """Identify potential focus areas for analysis based on keywords and data."""
    focus_areas = []
    
    # Check for financial analysis keywords
    financial_terms = {
        'profit', 'loss', 'revenue', 'income', 'expense', 'cost', 'margin', 
        'balance', 'asset', 'liability', 'equity', 'cash', 'flow'
    }
    
    for kw in keywords:
        if kw in financial_terms:
            focus_areas.append('financial_analysis')
            break
    
    # Check transaction volume
    if data.get('transaction_count', 0) > 1000:
        focus_areas.append('transaction_volume_analysis')
    
    # Check for potential anomalies
    if data.get('summary', {}).get('net_result', 0) < 0:
        focus_areas.append('profitability_concerns')
    
    return focus_areas
