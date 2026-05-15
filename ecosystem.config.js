module.exports = {
  apps: [
    {
      name: 'admarket-bridge',
      script: 'node_modules/ts-node/dist/bin.js',
      args: 'server/openclawBridgeServer.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 4020,
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: 'logs/bridge-error.log',
      out_file: 'logs/bridge-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'admarket-dashboard',
      script: 'node_modules/ts-node/dist/bin.js',
      args: 'server/dashboardServer.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: 'logs/dashboard-error.log',
      out_file: 'logs/dashboard-out.log',
      merge_logs: true,
      time: true,
    }
  ]
};
