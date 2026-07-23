module.exports = {
  apps: [
    {
      name: "webhook-api",
      script: "src/server.js",
      cwd: "/var/www/hooks.xiliumonline.net/WebHook",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
