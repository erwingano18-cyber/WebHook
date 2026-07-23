module.exports = {
  apps: [
    {
      name: "webhook-api",
      script: "src/server.js",
      cwd: "/var/www/WebHook",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
