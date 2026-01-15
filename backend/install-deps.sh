#!/bin/bash

# Navigate to backend directory
cd "$(dirname "$0")"

# Install production dependencies
echo "Installing production dependencies..."
npm install --production

# Install dev dependencies
echo "Installing development dependencies..."
npm install --only=dev

echo "Dependencies installed successfully!"
