// PM2 for AttendX: keeps the Next.js server running, restarts it on crash,
// brings it back after reboot. Bound to 127.0.0.1; nginx is the only way in.
module.exports = {
  apps: [
    {
      name: "attendx",
      cwd: "/opt/attendx/app/attendx-v2",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 4200",
      node_args: "--max-old-space-size=1024",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1200M",
      time: true,
    },
  ],
};
