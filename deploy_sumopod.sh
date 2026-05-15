#!/bin/bash
# ==========================================
# AdMarket Sumopod VPS Deployment Script
# ==========================================
# This script sets up the environment and deploys the AdMarket OpenClaw Bridge
# and the visualization dashboard to a Sumopod VPS.

# Inject the Sumopod token for verification
export SUMOPOD_TOKEN="BUILDCLUB-280DE26CA66D3629F889C4AAB1A2E2"

echo "Deploying AdMarket Protocol..."
echo "Sumopod Token: $SUMOPOD_TOKEN"

# 1. Update and install prerequisites
sudo apt-get update
sudo apt-get install -y curl git build-essential

# 2. Install Node.js 20.x
if ! command -v node &> /dev/null
then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 3. Install PM2 globally
if ! command -v pm2 &> /dev/null
then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 4. Navigate to app directory (assuming repo is cloned in ~/AdMarket)
cd ~/AdMarket || { echo "Directory ~/AdMarket not found. Please clone the repo first."; exit 1; }

# 5. Install dependencies
echo "Installing project dependencies..."
npm install

# 6. Create logs directory
mkdir -p logs

# 7. Start the ecosystem via PM2
echo "Starting services via PM2..."
pm2 start ecosystem.config.js

# 8. Save PM2 state for reboots
pm2 save
pm2 startup | tail -n 1 | bash

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Bridge running on:    http://<VPS_IP>:4020/openclaw"
echo "Dashboard running on: http://<VPS_IP>:3000"
echo "Sumopod integration successful."
echo "Configure Jetorbit to point your domain to the VPS IP."
