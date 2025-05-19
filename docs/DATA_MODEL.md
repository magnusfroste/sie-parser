# SIE Parser Data Model Architecture

## Overview

The SIE Parser application is designed to handle SIE 4 files from different bookkeeping systems (Bokio, Dooer, Fortnox) and normalize them into a standardized data model, regardless of source system variations. This document serves as the definitive reference for how data flows through the application and how the standardized data model serves as the API between the parser and the frontend.

## Core Principles

1. **Single Source of Truth**: The standardized data model defined in `data_model.py` is the only representation that should be used in the frontend.

2. **System-Specific Parsing**: Different bookkeeping systems implement the SIE 4 format with slight variations. We handle these variations at the parser level, not in the frontend.

3. **Clean Separation of Concerns**: 
   - **Parser** (`sie_parser.py`): Handles file parsing and system-specific quirks
   - **Data Model** (`data_model.py`): Standardizes the parsed data into a consistent structure
   - **Frontend**: Only interacts with the standardized data model

## Data Flow

```
SIE File (Bokio/Dooer/Fortnox) → SIE Parser → Raw Parsed Data → Data Model → Frontend Views
```

## System-Specific Variations

### Bokio Files
- Amounts often appear in verification or date fields instead of amount field
- Original verification numbers should be preserved
- Special handling of text fields that contain only numeric values

### Dooer Files
- Amount values are sometimes placed in the text field position
- Date format may be different compared to standard SIE 4 format

### Fortnox Files
- Most closely follows the standard SIE 4 format
- Consistent placement of amount fields

## Standardized Data Model Classes

### Account
Represents an account in the chart of accounts.
- `number`: Account number
- `name`: Account name
- `type`: Account type (Asset, Liability/Equity, Income, Expense)
- `balance`: Current balance
- `transactions_amount`: Sum of transaction amounts

### Transaction
Represents a single transaction line.
- `account`: Account number
- `amount`: Transaction amount
- `date`: Transaction date
- `text`: Transaction description
- `account_name`: Name of the account

### Verification
Represents a verification (group of transactions).
- `series`: Verification series
- `number`: Verification number
- `date`: Verification date
- `text`: Verification description
- `transactions`: List of Transaction objects
- `original_number`: Preserves Bokio verification numbers
- `original_date`: Preserves Bokio date fields that contain amounts

### BalanceEntry
Represents a balance entry (opening or closing).
- `account`: Account number
- `amount`: Balance amount
- `year`: Fiscal year
- `had_transactions`: Flag indicating if the account had transactions
- `transaction_amount`: Sum of transaction amounts

### Metadata
Contains metadata about the SIE file.
- `company_name`: Name of the company
- `organization_number`: Organization number
- `financial_year_start`: Start of financial year
- `financial_year_end`: End of financial year
- `generation_date`: When the SIE file was generated
- `program`: Source program (Bokio, Dooer, Fortnox)
- `program_version`: Version of the source program

## SIEDataModel
Main data model class that standardizes SIE data across different bookkeeping systems.

Key methods:
- `from_parser_data(parser_data)`: Converts parser data to standardized model
- `get_balance_sheet()`: Generates a balance sheet from the data model
- `get_income_statement()`: Generates an income statement from the data model
- `calculate_account_balances()`: Calculates balances for all accounts
- `to_dict()`: Converts the data model to a dictionary for JSON serialization

## Integration Guidelines

### For Frontend Developers
- Always read from the standardized data model fields
- Never implement system-specific workarounds in the frontend
- Use the consistent field names defined in the data model
- If data isn't appearing correctly, the fix belongs in the parser or data model, not in the frontend

### For Backend Developers
- System-specific parsing logic belongs in the parser
- All data should be normalized in the `from_parser_data` method
- Add proper validation and error checking in the data model
- The parser should detect the source program and apply appropriate parsing rules

### For QA Testing
- Test with sample files from all three systems (Bokio, Dooer, Fortnox)
- Verify that all views display consistent data regardless of source system
- Particularly test edge cases mentioned in system-specific variations

## Common Issues and Solutions

### Issue: Amounts showing as 0 when they should have values
**Solution**: Check if the parser is correctly moving values from text fields to amount fields for system-specific formats.

### Issue: Missing verification numbers in Bokio transactions
**Solution**: Ensure the parser preserves original verification numbers and generates standard formats when needed.

### Issue: Transaction descriptions not appearing correctly
**Solution**: Make sure both verification-level and transaction-specific texts are combined in the appropriate data model fields.

### Issue: Accounts with zero balances cluttering views
**Solution**: Filter out accounts with zero balances or zero transaction amounts in each view.

## Key Implementation Details

### Program-Specific Parsing
The parser detects the source program from the #PROGRAM tag in SIE files and applies specific parsing rules:

- **Bokio**: Checks fields that might contain amounts instead of their intended data
- **Dooer**: Handles amount values placed in text fields
- **Fortnox**: Generally follows standard SIE format

### Smart Field Detection
For fields that might contain data in the wrong place:
- Check if text fields contain only numeric values
- Move such values to the correct amount fields
- Preserve original data in separate fields for reference

### Transaction Aggregation
- Transactions are grouped by account in the ledger view
- Each account maintains both its balance and separate transaction amount
- Views filter out zero-value accounts for cleaner display

## Future Development

When implementing new features or views:
1. First understand how the data is represented in the standardized model
2. Make sure any new system-specific behaviors are handled in the parser
3. Add appropriate validation and error handling in both parser and data model
4. Document new parser behaviors for system-specific variations

## Conclusion

By maintaining a strict separation between parsing logic and frontend display, with the data model serving as the API between them, we ensure that the SIE Parser application handles data consistently regardless of the source system. All system-specific variations should be handled at parse time, resulting in a clean, standardized data structure that the frontend can rely on.
