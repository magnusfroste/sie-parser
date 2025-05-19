# SIE Parser - Quick Start Guide

This guide explains how to quickly run the SIE Parser application on a Mac.

## Prerequisites

- Python 3.6 or later installed
- macOS 10.14 or later

## Quick Start (One Command)

For the easiest setup, just run the start script:

```bash
./start.sh
```

This will:
1. Create a virtual environment if needed
2. Install all required dependencies 
3. Start the application
4. Open the application in your browser at http://localhost:5054

## Manual Setup

If you prefer to set up manually:

1. **Setup environment**:
   ```bash
   ./setup.sh
   ```

2. **Start the application**:
   ```bash
   source venv/bin/activate
   python app.py
   ```

3. **Access the application**:
   - Open your browser to http://localhost:5054

## SIE File Compatibility

The parser is designed to handle SIE files from multiple bookkeeping systems:
- Bokio
- Dooer
- Fortnox

The application automatically detects the source program and applies appropriate parsing logic to ensure consistent data handling.

## Key Features

- Parses Swedish SIE 4 files with CP437 encoding support
- Standardized data model for consistent handling across all bookkeeping systems
- Multiple view options: Balance Sheet, Income Statement, Ledger, Transactions
- LLM-ready data export
- Search and filter capabilities

## Troubleshooting

If you encounter any issues:

1. **Python not found**: Install Python 3.6+ from python.org
2. **Permission denied**: Run `chmod +x setup.sh start.sh` to make scripts executable
3. **Port conflict**: If port 5054 is in use, edit app.py and change the port number in the last line
