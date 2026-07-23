# Deploy to hooks.xiliumonline.net

This guide assumes an Ubuntu VPS with sudo access.

## 1) DNS

Create an A record:

- Host: hooks
- Value: your VPS public IP
- TTL: default

## 2) Install runtime

sudo apt update
sudo apt install -y nginx mysql-server
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

## 3) Deploy project

sudo mkdir -p /var/www/hooks.xiliumonline.net
cd /var/www/hooks.xiliumonline.net
sudo git clone https://github.com/erwingano18-cyber/WebHook.git
sudo chown -R $USER:$USER /var/www/hooks.xiliumonline.net/WebHook
cd /var/www/hooks.xiliumonline.net/WebHook
npm install
npm --prefix client install
npm --prefix client run build

## 4) Configure environment

cp .env.example .env

Edit .env with production values:

- PORT=3000
- CLIENT_ORIGIN=https://hooks.xiliumonline.net
- WEBFLOW_WEBHOOK_SECRET=your-secret
- MYSQL_HOST=127.0.0.1
- MYSQL_PORT=3306
- MYSQL_USER=your_db_user
- MYSQL_PASSWORD=your_db_password
- MYSQL_DATABASE=webhook_leads
- SMTP and SuiteCRM variables

## 5) Prepare MySQL user

sudo mysql

Run SQL:

CREATE USER 'webhook_user'@'localhost' IDENTIFIED BY 'replace_with_strong_password';
GRANT ALL PRIVILEGES ON *.* TO 'webhook_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

Then set MYSQL_USER and MYSQL_PASSWORD in .env to this user.

## 6) Start API with PM2

pm2 start ecosystem.config.js
pm2 save
pm2 startup

## 7) Configure Nginx

sudo cp deploy/nginx-hooks.conf /etc/nginx/sites-available/hooks.xiliumonline.net
sudo ln -s /etc/nginx/sites-available/hooks.xiliumonline.net /etc/nginx/sites-enabled/hooks.xiliumonline.net
sudo nginx -t
sudo systemctl reload nginx

## 8) Enable HTTPS

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hooks.xiliumonline.net

## 9) Verify

- Dashboard: https://hooks.xiliumonline.net
- Health: https://hooks.xiliumonline.net/health
- Webhook URL for Webflow: https://hooks.xiliumonline.net/webhook/webflow

Use this header in Webflow if secret is enabled:

- x-webhook-secret: your-secret
