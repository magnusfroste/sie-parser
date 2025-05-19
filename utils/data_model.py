"""
SIE Parser Data Model

This module defines a consistent data model for SIE files from different bookkeeping systems
(Bokio, Dooer, Fortnox). It provides classes and methods to standardize the data structure
regardless of the source system, ensuring consistent handling in the frontend.
"""

from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any, Union
import json


@dataclass
class Account:
    """Represents an account in the chart of accounts."""
    number: str
    name: str
    type: str = ""  # Asset, Liability, Equity, Income, Expense
    balance: float = 0.0
    transactions_amount: float = 0.0
    
    def to_dict(self):
        return asdict(self)


@dataclass
class Transaction:
    """Represents a single transaction line."""
    account: str
    amount: float
    date: str = ""
    text: str = ""
    account_name: str = ""
    
    def to_dict(self):
        return asdict(self)


@dataclass
class Verification:
    """Represents a verification (group of transactions)."""
    series: str = ""
    number: str = ""
    date: str = ""
    text: str = ""
    transactions: List[Transaction] = field(default_factory=list)
    original_number: str = ""  # For preserving Bokio verification numbers
    original_date: str = ""    # For preserving Bokio date fields that contain amounts
    
    def to_dict(self):
        return {
            "series": self.series,
            "number": self.number,
            "date": self.date,
            "text": self.text,
            "original_number": self.original_number,
            "original_date": self.original_date,
            "transactions": [t.to_dict() for t in self.transactions]
        }


@dataclass
class BalanceEntry:
    """Represents a balance entry (opening or closing)."""
    account: str
    amount: float
    year: str = ""
    had_transactions: bool = False
    transaction_amount: float = 0.0
    
    def to_dict(self):
        return asdict(self)


@dataclass
class Metadata:
    """Represents metadata about the SIE file."""
    company_name: str = ""
    organization_number: str = ""
    financial_year_start: str = ""
    financial_year_end: str = ""
    generation_date: str = ""
    program: str = ""
    program_version: str = ""
    currency: str = "SEK"
    fiscal_years: Dict[str, Dict[str, str]] = field(default_factory=dict)
    current_fiscal_year: Dict[str, str] = field(default_factory=dict)
    current_fiscal_year_start_year: str = ""
    current_fiscal_year_end_year: str = ""
    
    def to_dict(self):
        return asdict(self)


class SIEDataModel:
    """
    Main data model class that standardizes SIE data across different bookkeeping systems.
    This class handles the conversion from raw parsed data to a consistent structure.
    """
    
    def __init__(self):
        self.metadata = Metadata()
        self.accounts: Dict[str, Account] = {}
        self.verifications: List[Verification] = []
        self.opening_balances: Dict[str, Dict[str, BalanceEntry]] = {}  # Year -> Account -> BalanceEntry
        self.closing_balances: Dict[str, Dict[str, BalanceEntry]] = {}  # Year -> Account -> BalanceEntry
        self.results: Dict[str, Dict[str, BalanceEntry]] = {}  # Year -> Account -> BalanceEntry
        
    def from_parser_data(self, parser_data: dict) -> 'SIEDataModel':
        """
        Convert parser data to standardized data model.
        
        Args:
            parser_data: Data from the SIE parser
            
        Returns:
            SIEDataModel instance
        """
        print("Converting parser data to standardized data model")
        print(f"Parser data keys: {parser_data.keys()}")
        
        # Process metadata
        metadata = parser_data.get('metadata', {})
        self.metadata = Metadata(
            company_name=metadata.get('company_name', ''),
            organization_number=metadata.get('organization_number', ''),
            financial_year_start=metadata.get('financial_year_start', ''),
            financial_year_end=metadata.get('financial_year_end', ''),
            generation_date=metadata.get('date', ''),
            program=metadata.get('program', ''),
            program_version=metadata.get('program_version', ''),
            currency=metadata.get('currency', 'SEK'),
            fiscal_years=metadata.get('fiscal_years', {}),
            current_fiscal_year=metadata.get('current_fiscal_year', {}),
            current_fiscal_year_start_year=metadata.get('current_fiscal_year_start_year', ''),
            current_fiscal_year_end_year=metadata.get('current_fiscal_year_end_year', '')
        )
        
        # Process accounts
        for acc_num, acc_data in parser_data.get('accounts', {}).items():
            self.accounts[acc_num] = Account(
                number=acc_num,
                name=acc_data.get('name', ''),
                type=self._determine_account_type(acc_num)
            )
        
        # Process verifications and transactions
        print(f"Processing {len(parser_data.get('verifications', []))} verifications")
        for ver_index, ver_data in enumerate(parser_data.get('verifications', [])):
            print(f"Processing verification {ver_index}: {type(ver_data)}")
            
            # Check if ver_data is a Verification object or a dictionary
            if hasattr(ver_data, 'series'):
                # It's a Verification object
                verification = Verification(
                    series=getattr(ver_data, 'series', ''),
                    number=getattr(ver_data, 'number', ''),
                    date=getattr(ver_data, 'date', ''),
                    text=getattr(ver_data, 'text', ''),
                    original_number=getattr(ver_data, 'original_number', ''),
                    original_date=getattr(ver_data, 'original_date', '')
                )
                
                # Process transactions
                if hasattr(ver_data, 'transactions'):
                    print(f"Verification {ver_index} has {len(ver_data.transactions)} transactions")
                    for trans_index, trans_data in enumerate(ver_data.transactions):
                        print(f"Processing transaction {trans_index} in verification {ver_index}: {type(trans_data)}")
                        
                        # Check if trans_data is a Transaction object or a dictionary
                        if hasattr(trans_data, 'account'):
                            transaction = Transaction(
                                account=getattr(trans_data, 'account', ''),
                                amount=getattr(trans_data, 'amount', 0.0),
                                date=getattr(trans_data, 'date', verification.date),
                                text=getattr(trans_data, 'text', '')
                            )
                            
                            # Set account_name if available
                            if hasattr(trans_data, 'account_name') and getattr(trans_data, 'account_name'):
                                transaction.account_name = getattr(trans_data, 'account_name')
                            elif trans_data.account in self.accounts:
                                transaction.account_name = self.accounts[trans_data.account].name
                        else:
                            transaction = Transaction(
                                account=trans_data.get('account', ''),
                                amount=trans_data.get('amount', 0.0),
                                date=trans_data.get('date', verification.date),
                                text=trans_data.get('text', '')
                            )
                            
                            # Set account_name if available
                            if 'account_name' in trans_data and trans_data['account_name']:
                                transaction.account_name = trans_data['account_name']
                            elif trans_data.get('account') in self.accounts:
                                transaction.account_name = self.accounts[trans_data.get('account')].name
                                
                        verification.transactions.append(transaction)
                else:
                    print(f"Warning: Verification {ver_index} has no transactions attribute")
            else:
                # It's a dictionary
                verification = Verification(
                    series=ver_data.get('series', ''),
                    number=ver_data.get('number', ''),
                    date=ver_data.get('date', ''),
                    text=ver_data.get('text', ''),
                    original_number=ver_data.get('original_number', ''),
                    original_date=ver_data.get('original_date', '')
                )
                
                # Process transactions
                if 'transactions' in ver_data:
                    print(f"Verification {ver_index} has {len(ver_data.get('transactions', []))} transactions (dict)")
                    for trans_index, trans_data in enumerate(ver_data.get('transactions', [])):
                        print(f"Processing transaction {trans_index} in verification {ver_index} (dict): {trans_data}")
                        
                        transaction = Transaction(
                            account=trans_data.get('account', ''),
                            amount=trans_data.get('amount', 0.0),
                            date=trans_data.get('date', verification.date),
                            text=trans_data.get('text', '')
                        )
                        
                        # Set account_name if available
                        if 'account_name' in trans_data and trans_data['account_name']:
                            transaction.account_name = trans_data['account_name']
                        elif trans_data.get('account') in self.accounts:
                            transaction.account_name = self.accounts[trans_data.get('account')].name
                            
                        verification.transactions.append(transaction)
                else:
                    print(f"Warning: Verification {ver_index} has no transactions key in dictionary")
            
            self.verifications.append(verification)
        
        # Process opening balances
        for year, balances in parser_data.get('ib', {}).items():
            if year not in self.opening_balances:
                self.opening_balances[year] = {}
            
            for acc_num, amount in balances.items():
                self.opening_balances[year][acc_num] = BalanceEntry(
                    account=acc_num,
                    amount=amount,
                    year=year
                )
        
        # Process closing balances
        for year, balances in parser_data.get('ub', {}).items():
            if year not in self.closing_balances:
                self.closing_balances[year] = {}
            
            for acc_num, amount in balances.items():
                self.closing_balances[year][acc_num] = BalanceEntry(
                    account=acc_num,
                    amount=amount,
                    year=year
                )
        
        # Process results
        print(f"Processing results data from parser: {parser_data.get('res', {})}")
        for year, results in parser_data.get('res', {}).items():
            if year not in self.results:
                self.results[year] = {}
            
            # Handle different data types for results
            if isinstance(results, dict):
                for acc_num, amount in results.items():
                    # Handle both direct number values and object values with amount property
                    actual_amount = amount
                    if isinstance(amount, dict) and 'amount' in amount:
                        actual_amount = amount['amount']
                    elif isinstance(amount, (str, int, float)):
                        try:
                            actual_amount = float(amount)
                        except (ValueError, TypeError):
                            actual_amount = 0.0
                    
                    print(f"Adding result: Year={year}, Account={acc_num}, Amount={actual_amount}")
                    self.results[year][acc_num] = BalanceEntry(
                        account=acc_num,
                        amount=actual_amount,
                        year=year
                    )
        
        # Debug output for results data
        if not self.results or all(len(accounts) == 0 for accounts in self.results.values()):
            print("No RES data found in the SIE file. This may be normal if the SIE file doesn't contain result information.")
        else:
            print(f"Found {sum(len(accounts) for accounts in self.results.values())} result accounts across {len(self.results)} years")
            
        
        return self
    
    def _determine_account_type(self, account_number: str) -> str:
        """
        Determine the account type based on the account number.
        Swedish BAS standard account types:
        1xxx = Assets
        2xxx = Liabilities and Equity
        3xxx = Income
        4xxx-8xxx = Expenses
        
        Args:
            account_number: The account number
            
        Returns:
            Account type as a string
        """
        if not account_number or not account_number[0].isdigit():
            return ""
        
        first_digit = int(account_number[0])
        
        if first_digit == 1:
            return "Asset"
        elif first_digit == 2:
            return "Liability/Equity"
        elif first_digit == 3:
            return "Income"
        elif 4 <= first_digit <= 8:
            return "Expense"
        else:
            return "Other"
    
    def calculate_account_balances(self):
        """
        Calculate current balances for all accounts based on opening balances and transactions.
        """
        # Get the current financial year
        current_year = self.metadata.financial_year_start[:4]
        
        # Initialize all accounts with zero balance and zero transactions
        for acc_num, account in self.accounts.items():
            account.balance = 0.0
            account.transactions_amount = 0.0  # Track transactions separately
        
        # Find the correct opening balance year key
        # In SIE files, opening balances are typically stored with negative year offsets
        opening_balance_year = None
        for year_key in self.opening_balances.keys():
            # Use the first year key found (typically -12, -11, etc.)
            opening_balance_year = year_key
            break
        
        # Add opening balances using the first available year key
        if opening_balance_year and opening_balance_year in self.opening_balances:
            for acc_num, balance_entry in self.opening_balances[opening_balance_year].items():
                if acc_num in self.accounts:
                    self.accounts[acc_num].balance = balance_entry.amount
        
        # Track accounts with transactions
        accounts_with_transactions = set()
        
        # Add transaction amounts - only for the current year
        for verification in self.verifications:
            # Check if the verification is for the current year
            if verification.date and verification.date.startswith(current_year):
                for transaction in verification.transactions:
                    acc_num = transaction.account
                    if acc_num in self.accounts:
                        self.accounts[acc_num].balance += transaction.amount
                        self.accounts[acc_num].transactions_amount += transaction.amount
                        accounts_with_transactions.add(acc_num)
                    
        # Store closing balances and transaction info
        if current_year not in self.closing_balances:
            self.closing_balances[current_year] = {}
            
        for acc_num, account in self.accounts.items():
            if account.balance != 0:
                # Create a balance entry for the closing balance
                balance_entry = BalanceEntry(account=acc_num, amount=account.balance, year=current_year)
                # Add a flag to indicate if this account had transactions
                balance_entry.had_transactions = acc_num in accounts_with_transactions
                # Add the transaction amount for this account
                balance_entry.transaction_amount = getattr(account, 'transactions_amount', 0.0)
                self.closing_balances[current_year][acc_num] = balance_entry
    
    def get_balance_sheet(self) -> Dict[str, Any]:
        """
        Generate a balance sheet from the data model.
        
        Returns:
            Dictionary with balance sheet data
        """
        self.calculate_account_balances()
        
        balance_sheet = {
            "assets": {},
            "liabilities": {},
            "equity": {},
            "total_assets": 0.0,
            "total_liabilities_equity": 0.0
        }
        
        for acc_num, account in self.accounts.items():
            if account.type == "Asset" and account.balance != 0:
                balance_sheet["assets"][acc_num] = {
                    "name": account.name,
                    "balance": account.balance
                }
                balance_sheet["total_assets"] += account.balance
            elif account.type == "Liability/Equity" and account.balance != 0:
                # Determine if it's liability or equity based on account number
                if acc_num.startswith("20") or acc_num.startswith("21"):
                    balance_sheet["equity"][acc_num] = {
                        "name": account.name,
                        "balance": account.balance
                    }
                else:
                    balance_sheet["liabilities"][acc_num] = {
                        "name": account.name,
                        "balance": account.balance
                    }
                balance_sheet["total_liabilities_equity"] += account.balance
        
        return balance_sheet
    
    def get_income_statement(self) -> Dict[str, Any]:
        """
        Generate an income statement from the data model.
        
        Returns:
            Dictionary with income statement data
        """
        self.calculate_account_balances()
        
        income_statement = {
            "income": {},
            "expenses": {},
            "total_income": 0.0,
            "total_expenses": 0.0,
            "net_income": 0.0
        }
        
        for acc_num, account in self.accounts.items():
            if account.type == "Income" and account.balance != 0:
                income_statement["income"][acc_num] = {
                    "name": account.name,
                    "amount": account.balance
                }
                income_statement["total_income"] += account.balance
            elif account.type == "Expense" and account.balance != 0:
                income_statement["expenses"][acc_num] = {
                    "name": account.name,
                    "amount": account.balance
                }
                income_statement["total_expenses"] += account.balance
        
        income_statement["net_income"] = income_statement["total_income"] - income_statement["total_expenses"]
        
        return income_statement
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the entire data model to a dictionary for JSON serialization.
        
        Returns:
            Dictionary representation of the data model
        """
        print("Converting data model to dictionary")
        result = {
            'metadata': self.metadata.to_dict(),
            'accounts': {acc_num: acc.to_dict() for acc_num, acc in self.accounts.items()},
            'verifications': [ver.to_dict() for ver in self.verifications],
            'opening_balances': {},
            'closing_balances': {},
            'results': {},
            'balance_sheet': self.get_balance_sheet(),
            'income_statement': self.get_income_statement()
        }
        
        # Process opening balances
        for year, balances in self.opening_balances.items():
            if year not in result['opening_balances']:
                result['opening_balances'][year] = {}
            
            for acc_num, balance in balances.items():
                result['opening_balances'][year][acc_num] = balance.to_dict()
        
        # Process closing balances
        for year, balances in self.closing_balances.items():
            if year not in result['closing_balances']:
                result['closing_balances'][year] = {}
            
            for acc_num, balance in balances.items():
                result['closing_balances'][year][acc_num] = balance.to_dict()
        
        # Process results
        print(f"Converting results data: {self.results}")
        for year, balances in self.results.items():
            if year not in result['results']:
                result['results'][year] = {}
            
            for acc_num, balance in balances.items():
                result['results'][year][acc_num] = balance.to_dict()
                print(f"Added result for year {year}, account {acc_num}: {balance.to_dict()}")
        
        print(f"Data model converted to dictionary with {len(result['verifications'])} verifications")
        print(f"Results in dictionary: {result['results']}")
        
        return result
    
    def to_json(self) -> str:
        """
        Convert the data model to a JSON string.
        
        Returns:
            JSON string representation of the data model
        """
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)
