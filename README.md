# SIE Parser for LLM Analysis

A web-based application for processing Swedish SIE 4 files and preparing them for LLM analysis. This tool handles CP437 encoding for proper Swedish character support and provides a user-friendly interface for uploading, processing, and exporting SIE data.

## Features

- Upload and parse Swedish SIE 4 files with CP437 encoding support
- View financial data in an organized, visual format
- Generate LLM-friendly JSON output with financial summaries
- Add custom descriptions to enhance LLM context
- Save processed data as JSON files
- Automatic aggregation for large transaction sets

## Requirements

- Python 3.7+
- Flask
- Modern web browser

## Installation

1. Clone or download this repository
2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

3. Run the application:

```bash
python app.py
```

4. Open your browser and navigate to `http://localhost:5000`

## Usage

1. Click "Choose a SIE file" to select your SIE 4 file (with .sie or .se extension)
2. Click "Process File" to upload and parse the file
3. View the processed data in the various tabs:
   - **Summary**: Overview of the financial data
   - **Balance Sheet**: Assets, liabilities, and equity
   - **Income Statement**: Income and expenses
   - **Transactions**: Individual transactions
   - **JSON Output**: LLM-ready JSON data
4. Add a description to provide context for LLM analysis
5. Save the JSON file for use with your preferred LLM (Gemma, Llama, Mistral, Claude, etc.)

## SIE Format Support

This application supports the SIE 4 format, including:
- #FLAGGA, #PROGRAM, #FORMAT, #GEN, #SIETYP, #FNAMN, #ORGNR sections
- #RAR (fiscal year) sections
- #KONTO (account) definitions
- #IB, #UB, #RES (opening balance, closing balance, result) sections
- #VER (verification) entries with #TRANS (transaction) records

## LLM Optimization

For large transaction sets (over 500 transactions), the application automatically:
- Creates aggregated summaries by account and month
- Provides sample transactions for context
- Generates balance sheet and income statement summaries
- Structures data to fit within typical LLM context windows

## Developer Documentation

For developers working on this project, please refer to these important documentation files:

- [Data Model Architecture](docs/DATA_MODEL.md) - Defines the standardized data model and how different bookkeeping systems (Bokio, Dooer, Fortnox) are handled
- [Testing Guidelines](docs/DATA_MODEL_TESTING.md) - Procedures for testing consistency across different SIE file formats

### Core Architecture Principles

1. **Standardized Data Model** - All SIE formats (Bokio, Dooer, Fortnox) are converted to a common representation
2. **Parser-level Normalization** - System-specific quirks are handled in the parser, not the frontend
3. **Clean API Boundary** - The data model serves as the API between the parser and frontend
## License

MIT
