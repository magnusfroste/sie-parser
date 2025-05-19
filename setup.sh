#!/bin/bash

# Exit on error
set -e

echo "Setting up SIE Parser application..."

# Check Python installation
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python not found. Please install Python 3.6 or later."
    exit 1
fi

echo "Using Python: $($PYTHON_CMD --version)"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Activate virtual environment and install dependencies
echo "Installing dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "Setup complete! To run the application:"
echo "1. Run: source venv/bin/activate"
echo "2. Run: python app.py"
echo "3. Open your browser to: http://localhost:5054"
