# Deployment Guide

This guide covers deploying the Multiplayer Music Quiz Game to Namecheap shared hosting and Hetzner Linux VPS.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build for Production](#build-for-production)
- [Namecheap Deployment](#namecheap-deployment)
- [Hetzner VPS Deployment](#hetzner-vps-deployment)
- [Environment Variables](#environment-variables)
- [SSL Configuration](#ssl-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js 18+ installed locally
- Git installed
- SSH access (for Hetzner)
- Domain name configured

### Local Build Requirements

```bash
# Install dependencies
npm install

# Build the client bundle
npm run build
```

---

## Build for Production

Before deploying, create a production build:

```bash
# Install production dependencies
npm ci --production

# Build client assets
npm run build

# The following files/folders are needed for deployment:
# - dist/           (client bundle)
# - src/server/     (server code)
# - index.html
# - styles.css
# - package.json
# - package-lock.json
```

---

## Namecheap Deployment

Namecheap shared hosting has limitations with Node.js. You have two options:

### Option A: Using Namecheap's Node.js Selector (cPanel)

1. **Access cPanel**
   - Log into your Namecheap account
   - Go to cPanel for your hosting

2. **Enable Node.js**
   - Find "Setup Node.js App" in cPanel
   - Click "Create Application"
   - Configure:
     - Node.js version: `18` or higher
     - Application mode: `Production`
     - Application root: `public_html/musicquiz` (or your preferred folder)
     - Application URL: Your domain
     - Application startup file: `src/server/index.js`

3. **Upload Files**

   Using File Manager or FTP, upload these files to your application root:
   ```
   dist/
   src/
   index.html
   styles.css
   package.json
   package-lock.json
   .env (create with production values)
   ```

4. **Install Dependencies**
   - In cPanel Node.js app, click "Run NPM Install"
   - Or use the terminal: `npm ci --production`

5. **Configure Environment**

   Create `.env` in application root:
   ```env
   NODE_ENV=production
   PORT=3000
   ```

6. **Start the Application**
   - Click "Start App" in Node.js Selector
   - Or restart via cPanel

### Option B: Static Hosting + External Node.js Server

If Node.js isn't available, host static files on Namecheap and run the server elsewhere:

1. **Upload Static Files to Namecheap**
   ```
   public_html/
   ├── index.html
   ├── styles.css
   └── dist/
       └── bundle.js
   ```

2. **Update Socket.IO Connection**

   Edit the client to point to your external server:
   ```javascript
   // In src/client/socket.js, update the connection URL
   const socket = io('https://your-server.com');
   ```

3. **Run Server on Hetzner** (see below)

---

## Hetzner VPS Deployment

### Initial Server Setup

1. **Connect to Your Server**
   ```bash
   ssh root@your-server-ip
   ```

2. **Update System**
   ```bash
   apt update && apt upgrade -y
   ```

3. **Install Node.js**
   ```bash
   # Install Node.js 20.x
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   apt install -y nodejs

   # Verify installation
   node --version
   npm --version
   ```

4. **Install PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   ```

5. **Create Application User**
   ```bash
   adduser --disabled-password --gecos "" musicquiz
   usermod -aG sudo musicquiz
   ```

### Deploy Application

1. **Clone or Upload Your Code**
   ```bash
   # Switch to app user
   su - musicquiz

   # Option 1: Clone from Git
   git clone https://github.com/your-repo/music-quiz.git
   cd music-quiz

   # Option 2: Upload via SCP (from local machine)
   scp -r ./fam_game musicquiz@your-server-ip:~/music-quiz
   ```

2. **Install Dependencies**
   ```bash
   cd ~/music-quiz
   npm ci --production
   ```

3. **Build Client**
   ```bash
   npm run build
   ```

4. **Configure Environment**
   ```bash
   # Create .env file
   cat > .env << EOF
   NODE_ENV=production
   PORT=3000
   EOF
   ```

5. **Start with PM2**
   ```bash
   # Start the application
   pm2 start src/server/index.js --name "music-quiz"

   # Save PM2 configuration
   pm2 save

   # Enable startup on boot
   pm2 startup systemd -u musicquiz --hp /home/musicquiz
   ```

6. **Verify Application**
   ```bash
   pm2 status
   pm2 logs music-quiz
   ```

### Configure Nginx Reverse Proxy

1. **Install Nginx**
   ```bash
   sudo apt install nginx -y
   ```

2. **Create Nginx Configuration**
   ```bash
   sudo nano /etc/nginx/sites-available/music-quiz
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;

           # WebSocket support (required for Socket.IO)
           proxy_read_timeout 86400;
       }

       # Static file caching
       location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
           proxy_pass http://localhost:3000;
           expires 1y;
           add_header Cache-Control "public, immutable";
       }
   }
   ```

3. **Enable Site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/music-quiz /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. **Configure Firewall**
   ```bash
   sudo ufw allow 'Nginx Full'
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```

---

## SSL Configuration

### Using Let's Encrypt (Recommended)

1. **Install Certbot**
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   ```

2. **Obtain Certificate**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

3. **Auto-Renewal**
   ```bash
   # Test renewal
   sudo certbot renew --dry-run

   # Certbot automatically adds a cron job for renewal
   ```

### Manual SSL (Namecheap)

1. Purchase SSL certificate from Namecheap
2. Upload certificate files via cPanel
3. Enable "Force HTTPS" in cPanel

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |

### Production .env Example

```env
NODE_ENV=production
PORT=3000
```

---

## PM2 Commands Reference

```bash
# View all processes
pm2 list

# View logs
pm2 logs music-quiz

# Restart application
pm2 restart music-quiz

# Stop application
pm2 stop music-quiz

# Delete from PM2
pm2 delete music-quiz

# Monitor resources
pm2 monit
```

---

## Updating the Application

### On Hetzner VPS

```bash
# Switch to app user
su - musicquiz
cd ~/music-quiz

# Pull latest changes
git pull origin main

# Install any new dependencies
npm ci --production

# Rebuild client
npm run build

# Restart application
pm2 restart music-quiz
```

### On Namecheap

1. Upload new files via FTP/File Manager
2. Run `npm install` in Node.js Selector
3. Restart the application

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs music-quiz --lines 100

# Check if port is in use
sudo lsof -i :3000

# Kill process on port
sudo kill -9 $(sudo lsof -t -i:3000)
```

### WebSocket Connection Issues

1. Ensure Nginx config includes WebSocket headers
2. Check firewall allows the port
3. Verify SSL is properly configured for WSS

```bash
# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" \
  http://localhost:3000/socket.io/
```

### 502 Bad Gateway

```bash
# Check if Node.js app is running
pm2 status

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart services
pm2 restart music-quiz
sudo systemctl restart nginx
```

### Permission Issues

```bash
# Fix ownership
sudo chown -R musicquiz:musicquiz /home/musicquiz/music-quiz

# Fix permissions
chmod -R 755 /home/musicquiz/music-quiz
```

### Memory Issues

```bash
# Check memory usage
free -m

# Add swap if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Performance Optimization

### Enable Gzip Compression

Add to Nginx config:
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

### PM2 Cluster Mode (Multi-core)

```bash
# Start with cluster mode
pm2 start src/server/index.js -i max --name "music-quiz"
```

### Monitoring

```bash
# Install PM2 monitoring
pm2 install pm2-logrotate

# Set log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Quick Reference

### Hetzner Deployment Checklist

- [ ] Server updated (`apt update && apt upgrade`)
- [ ] Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Application code uploaded
- [ ] Dependencies installed (`npm ci --production`)
- [ ] Client built (`npm run build`)
- [ ] `.env` configured
- [ ] PM2 process started
- [ ] Nginx configured
- [ ] SSL certificate installed
- [ ] Firewall configured

### Namecheap Deployment Checklist

- [ ] Node.js app created in cPanel
- [ ] Files uploaded
- [ ] NPM install completed
- [ ] Environment variables set
- [ ] Application started
- [ ] SSL configured
