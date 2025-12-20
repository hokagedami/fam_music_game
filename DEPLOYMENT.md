# Deployment Guide

This guide covers deploying the Multiplayer Music Quiz Game to DigitalOcean App Platform (recommended), Namecheap shared hosting, and Hetzner Linux VPS.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build for Production](#build-for-production)
- [DigitalOcean App Platform (Recommended)](#digitalocean-app-platform-recommended)
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

## DigitalOcean App Platform (Recommended)

DigitalOcean App Platform provides a fully managed platform for deploying Node.js applications with automatic scaling, SSL, and CI/CD integration.

### Why App Platform?

- **Zero infrastructure management** - No server setup, patches, or maintenance
- **Automatic SSL** - Free HTTPS certificates managed automatically
- **Built-in CI/CD** - Auto-deploy on git push
- **WebSocket support** - Full Socket.IO compatibility
- **Horizontal scaling** - Scale containers with one click

### Prerequisites

- DigitalOcean account
- GitHub repository with your code
- Domain name (optional, free `.ondigitalocean.app` subdomain provided)

### Deployment Steps

#### 1. Prepare Your Repository

Ensure your repository has these files:

```
├── src/
│   ├── client/
│   └── server/
│       └── index.js
├── index.html
├── styles.css
├── package.json
├── package-lock.json
└── .env.example
```

#### 2. Create the App

1. Log into [DigitalOcean Cloud Console](https://cloud.digitalocean.com)
2. Navigate to **Apps** → **Create App**
3. Select **GitHub** as source
4. Authorize DigitalOcean to access your repository
5. Select your repository and branch (usually `main` or `master`)

#### 3. Configure the Web Service

DigitalOcean will auto-detect Node.js. Configure:

| Setting | Value |
|---------|-------|
| **Type** | Web Service |
| **Resource Size** | Basic ($5/mo) or Pro |
| **Instance Count** | 1 (can scale later) |
| **Build Command** | `npm ci && npm run build` |
| **Run Command** | `npm start` |
| **HTTP Port** | `3000` |

#### 4. Set Environment Variables

In the **Environment Variables** section, add:

```
NODE_ENV=production
PORT=3000
```

> **Note:** Do not set PORT to 8080. App Platform routes traffic to your specified port.

#### 5. Configure HTTP Routes

App Platform automatically handles routing, but verify:

- **HTTP Route**: `/` → Your web service
- **WebSocket support**: Enabled by default

#### 6. Deploy

1. Review your configuration
2. Click **Create Resources**
3. Wait for the build and deployment to complete (2-5 minutes)

### App Spec Configuration (Optional)

For advanced control, create an `app.yaml` in your repository root:

```yaml
name: music-quiz
region: nyc
services:
  - name: web
    github:
      repo: your-username/fam_music_game
      branch: master
      deploy_on_push: true
    source_dir: /
    build_command: npm ci && npm run build
    run_command: npm start
    http_port: 3000
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
    health_check:
      http_path: /api/health
      initial_delay_seconds: 10
      period_seconds: 30
```

Then deploy via CLI:

```bash
doctl apps create --spec app.yaml
```

### Custom Domain Setup

1. Go to your app's **Settings** → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `musicquiz.example.com`)
4. Add the provided CNAME record to your DNS:
   ```
   Type: CNAME
   Name: musicquiz (or @ for root)
   Value: your-app-xxxxx.ondigitalocean.app
   ```
5. Wait for DNS propagation (up to 24 hours)
6. SSL certificate is automatically provisioned

### WebSocket Configuration

App Platform fully supports WebSocket connections. Socket.IO works out of the box with these considerations:

- **Sticky sessions** are automatically handled
- **Long-polling fallback** works if WebSocket fails
- No additional Nginx or proxy configuration needed

### Monitoring & Logs

Access from your app dashboard:

- **Runtime Logs**: Real-time application logs
- **Build Logs**: Deployment build output
- **Insights**: CPU, memory, and request metrics
- **Alerts**: Set up notifications for errors or high resource usage

```bash
# View logs via CLI
doctl apps logs <app-id> --type=run
```

### Scaling

#### Vertical Scaling
Upgrade instance size in **Settings** → **Resources**:
- Basic ($5/mo) - 512 MB RAM, 1 vCPU
- Professional ($12/mo) - 1 GB RAM, 1 vCPU
- Professional ($25/mo) - 2 GB RAM, 2 vCPU

#### Horizontal Scaling
Increase instance count for high traffic:

```bash
doctl apps update <app-id> --spec app.yaml  # with updated instance_count
```

### Auto-Deploy on Push

Auto-deploy is enabled by default. Every push to your configured branch triggers:

1. Build: `npm ci && npm run build`
2. Health check
3. Zero-downtime deployment

To disable:
1. Go to **Settings** → **App Info**
2. Toggle off **Auto-Deploy**

### Cost Estimates

| Plan | Price | Specs | Best For |
|------|-------|-------|----------|
| Basic | $5/mo | 512 MB, 1 vCPU | Development, small games |
| Pro XS | $12/mo | 1 GB, 1 vCPU | Small production |
| Pro S | $25/mo | 2 GB, 2 vCPU | Medium traffic |
| Pro M | $50/mo | 4 GB, 2 vCPU | High traffic |

### Troubleshooting App Platform

#### Build Fails

```bash
# Check build logs
doctl apps logs <app-id> --type=build
```

Common issues:
- Missing `package-lock.json` - Run `npm install` locally and commit
- Node version mismatch - Add `"engines": { "node": ">=18" }` to package.json

#### App Crashes on Start

1. Check runtime logs for errors
2. Verify `PORT` environment variable matches `http_port`
3. Ensure `npm start` command is correct in package.json

#### WebSocket Connection Issues

- Verify client connects to the correct App Platform URL
- Check for mixed content (HTTP/HTTPS) issues
- Ensure Socket.IO client version matches server

#### Health Check Fails

If using custom health check:

```javascript
// Ensure /api/health returns 200
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
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

### DigitalOcean App Platform Checklist

- [ ] Code pushed to GitHub repository
- [ ] `package.json` has correct `start` script
- [ ] `package-lock.json` committed
- [ ] App created in DigitalOcean console
- [ ] GitHub repository connected
- [ ] Build command: `npm ci && npm run build`
- [ ] Run command: `npm start`
- [ ] HTTP port set to `3000`
- [ ] Environment variables configured
- [ ] Health check endpoint working (`/api/health`)
- [ ] Custom domain configured (optional)
- [ ] Auto-deploy enabled

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
