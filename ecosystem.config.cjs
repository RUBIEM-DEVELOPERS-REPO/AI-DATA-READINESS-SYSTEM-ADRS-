// PM2 process config for the AI Data Readiness System (ADRS).
// Edit APP_DIR to the absolute path on your cPanel VPS before starting.
const APP_DIR = "/home/USERNAME/apps/adrs";

module.exports = {
  apps: [
    {
      name: "adrs",
      cwd: APP_DIR,
      script: "dist/index.cjs",
      interpreter: "node",
      interpreter_args: `--env-file=${APP_DIR}/.env`,
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      watch: false,
      time: true,
      out_file: `${APP_DIR}/logs/pm2-out.log`,
      error_file: `${APP_DIR}/logs/pm2-error.log`,
      kill_timeout: 10000,
      listen_timeout: 20000,
    },
  ],
};
