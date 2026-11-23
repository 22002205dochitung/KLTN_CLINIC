/**
 * PM2 – keeps the THCT Clinic server running (restarts on crash and after a reboot).
 *   pm2 start deploy/ecosystem.config.js      (from the project folder)
 *   pm2 logs thct-clinic                      (view logs)
 *   pm2 restart thct-clinic                   (after uploading new code / editing .env)
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'thct-clinic',
      cwd: path.join(__dirname, '..', 'backend'),
      script: 'src/server.js',
      instances: 1, // one process: the payment-hold job and in-memory rate limits assume a single instance
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Ho_Chi_Minh'
      },
      out_file: path.join(__dirname, '..', 'logs', 'out.log'),
      error_file: path.join(__dirname, '..', 'logs', 'error.log'),
      time: true
    }
  ]
};
