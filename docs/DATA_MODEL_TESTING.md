# SIE Parser Testing Guidelines

## Overview

This document provides guidelines for testing the SIE Parser application, with a particular focus on ensuring consistent data handling across different bookkeeping systems (Bokio, Dooer, Fortnox). It complements the DATA_MODEL.md documentation by providing concrete testing procedures.

## Test Data Requirements

For comprehensive testing, you should have test files from each supported bookkeeping system:

1. **Bokio SIE files** - Look for:
   - Amounts in verification or date fields
   - Text fields containing numeric values
   - Special verification numbering

2. **Dooer SIE files** - Look for:
   - Amount values in text field positions
   - Unique date formatting

3. **Fortnox SIE files** - As a baseline for comparison

## Key Test Cases

### Parser Tests

1. **Program Detection Test**
   - Verify that the parser correctly identifies the source program (Bokio, Dooer, Fortnox)
   - Check that appropriate system-specific parsing rules are applied

2. **Smart Field Detection Test**
   - Test if the parser correctly identifies numeric values in text fields
   - Verify that these values are properly moved to amount fields
   - Ensure original data is preserved in appropriate fields

3. **Verification Structure Test**
   - Check that verification objects correctly group transactions
   - Verify that date, number, and series fields are properly populated
   - For Bokio files, ensure original verification numbers are preserved

4. **Transaction Parsing Test**
   - Verify account numbers are correctly extracted
   - Test that transaction amounts are accurately processed (especially for Dooer)
   - Check that date fields follow a consistent format in the data model

### Data Model Tests

1. **Normalization Test**
   - Verify that data from all three systems is normalized to the same structure
   - Check that account balances are calculated consistently

2. **Balance Calculation Test**
   - Test that opening balances + transactions = closing balances
   - Verify that account types are correctly determined

3. **View Data Generation Test**
   - Test that balance sheet data is generated correctly
   - Check that income statement data follows consistent structure
   - Verify that ledger view data properly groups transactions by account

### Frontend Integration Tests

1. **Data Consistency Test**
   - Verify that all views display correct data regardless of source system
   - Check that transactions show proper amounts and descriptions
   - Test that verification information is displayed consistently

2. **Zero-Value Filtering Test**
   - Verify that accounts with zero balances are properly filtered out
   - Check that this filtering works consistently across all views

3. **Search and Filter Test**
   - Test that search functionality works correctly with all data formats
   - Verify that filtering criteria apply consistently

## Test Validation Procedures

For each test file, complete the following validation:

1. Upload the SIE file
2. Check the data model output (console logs)
3. Verify in each view:
   - Balance Sheet: Accounts appear with correct balances
   - Income Statement: Income and expenses show correct amounts
   - Ledger View: Transactions are grouped by account with proper amounts
   - Transactions View: All transactions appear with correct details

## Regression Testing Checklist

When making changes to the parser or data model, always verify:

- [ ] All existing views continue to work as expected
- [ ] No system-specific workarounds have been added to the frontend
- [ ] Data model structure remains consistent
- [ ] Parsing logic correctly handles all three system formats
- [ ] Edge cases (zero amounts, special characters, etc.) are handled properly

## Troubleshooting Common Issues

| Issue | Check | Solution |
|-------|-------|----------|
| Missing amounts | Parser smart field detection | Fix amount extraction in parser |
| Inconsistent verification numbers | Bokio-specific parsing | Ensure original numbers are preserved |
| Missing transactions | Transaction parsing logic | Verify all transaction types are handled |
| Display inconsistencies | Frontend data access | Ensure frontend uses standardized fields |

## Conclusion

By following these testing guidelines, you can ensure that the SIE Parser application maintains consistent data handling across all supported bookkeeping systems. Remember that the goal is to handle system-specific variations at the parser level, producing a clean, standardized data model that serves as a reliable API for the frontend.
