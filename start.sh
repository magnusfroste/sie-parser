#!/bin/bash

# Exit on error
set -e

echo "Starting SIE Parser application..."

# Check Python installation
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python not found. Please install Python 3.6 or later."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Setting up virtual environment..."
    $PYTHON_CMD -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source venv/bin/activate
    # Check if dependencies are installed
    if ! pip show flask &>/dev/null; then
        echo "Installing dependencies..."
        pip install -r requirements.txt
    fi
fi

# Start the application
echo "Starting SIE Parser on http://localhost:5054"
echo "Press Ctrl+C to stop the server"
python app.py
