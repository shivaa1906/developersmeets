# Enterprise Production Deployment Guide

A complete, production-grade guide for deploying and maintaining the **Nexus Developer Company Platform** across containerized, cloud, and dedicated Linux environments.

---

## 1. Architecture & Infrastructure Topology

The platform comprises three core architectural tiers:

```
                          [ Client Browsers & Public Traffic ]
                                          │
                                          ▼  (HTTPS / 443)
                         ┌─────────────────────────────────┐
                         │  Nginx Reverse Proxy & SSL TLS  │
                         │  (Certbot / Let's Encrypt Cert) │
                         └────────────────┬────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │                                               │
                  ▼ (HTTP / 3000)                                 ▼ (HTTP & WS / 5000)
    ┌───────────────────────────┐                   ┌───────────────────────────┐
    │   Next.js 14 App Router   │                   │    Express API & Server   │
    │   (SSR, React Server Cmp) │                   │    WebSocket Realtime     │
    │   Standalone Node Runtime │                   │    Role-Based Governance  │
    └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                  │                                               │
                  │   Internal API Rewrites (/api/*)              │   Database Pool (pg)
                  └───────────────────────────────────────────────┤
                                                                  ▼ (Port 5432)
                                                    ┌───────────────────────────┐
                                                    │   PostgreSQL 16 Engine    │
                                                    │   Double-Entry Ledgers    │
                                                    │   Support & Project DB    │
                                                    └───────────────────────────┘
```

### Port Allocation & Service Matrix

| Service | Internal Port | External Port | Protocol | Process Manager |
| :--- | :---: | :---: | :---: | :--- |
| **Nginx Web Server** | `80`, `443` | `80`, `443` | HTTP / HTTPS | systemd (`nginx.service`) |
| **Next.js Frontend** | `3000` | Via Nginx Proxy | HTTP | PM2 / Docker Container |
| **Express API & WS** | `5000` | Via Nginx Proxy | HTTP & WSS (`/ws`) | PM2 / Docker Container |
| **PostgreSQL Database** | `5432` | Localhost / Private VPC | TCP / PostgreSQL | systemd / AWS RDS / Docker |

---

## 2. System & Server Prerequisites

### Minimum Hardware Specifications

- **CPU**: 2 vCPUs (4 vCPUs recommended for production clustering)
- **RAM**: 4 GB (8 GB recommended for concurrent Next.js SSR and build pipelines)
- **Storage**: 40 GB SSD (NVMe preferred for database IOPS)
- **Operating System**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (Debian 12 compatible)

### Required Software Packages

Ensure the following packages are installed on the host server:

```bash
# Update package repositories
sudo apt update && sudo apt upgrade -y

# Install core utilities
sudo apt install -y curl wget git build-essential ufw software-properties-common jq

# Install Node.js 20.x LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node and npm
node -v   # Expected: v20.x.x
npm -v    # Expected: 10.x.x

# Install PM2 process manager globally
sudo npm install -g pm2

# Install PostgreSQL 16 client utilities
sudo apt install -y postgresql-client
```

---

## 3. Environment Configuration & Secrets Management

The platform utilizes separated environment files for the root orchestrator, backend service, and frontend client.

### 3.1 Backend Environment Configuration (`backend/.env`)

Create `backend/.env` with production-grade secrets:

```env
# ==============================================================================
# BACKEND PRODUCTION ENVIRONMENT
# ==============================================================================
NODE_ENV=production
PORT=5000

# PostgreSQL Connection String
DATABASE_URL=postgresql://nexus_admin:YOUR_STRONG_DB_PASSWORD@127.0.0.1:5432/nexus_platform?sslmode=prefer

# High-Entropy 64-Character Secret for JWT Token Signing
# Generate with: openssl rand -hex 32
JWT_SECRET=f98a28e7b1a62d0439efb92c4b78e12d6a5c3b94871e0c8d6215f79a3b841e20
JWT_EXPIRES_IN=7d

# Allowed CORS Origin (Public Domain of Frontend)
CORS_ORIGIN=https://nexus.dev

# Platform Financial & Credit Configuration
CREDIT_PRICE_INR=50
CLAIM_COST_CREDITS=1
DEFAULT_REFUND_PERCENTAGE=100

# Payment Gateway Keys (Razorpay / Stripe)
PAYMENT_KEY_ID=rzp_live_your_live_key_here
PAYMENT_SECRET=your_razorpay_live_secret
PAYMENT_WEBHOOK_SECRET=your_razorpay_webhook_secret

# Optional Object Storage (Supabase / AWS S3)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3.2 Frontend Environment Configuration (`frontend/.env.local`)

Create `frontend/.env.local`:

```env
# ==============================================================================
# FRONTEND PRODUCTION ENVIRONMENT
# ==============================================================================
NODE_ENV=production

# Public site domain
NEXT_PUBLIC_SITE_URL=https://nexus.dev

# In browser contexts, API calls route through the relative Next.js proxy
NEXT_PUBLIC_API_URL=/api

# Internal target for Next.js SSR reverse-proxy rewrites
INTERNAL_API_URL=http://127.0.0.1:5000

# Telemetry
NEXT_TELEMETRY_DISABLED=1
```

---

## 4. Production Database Setup & Migrations

### 4.1 Provisioning PostgreSQL 16 (Self-Hosted on Ubuntu)

If self-hosting PostgreSQL on the same machine or dedicated database server:

```bash
# Install PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create Database User and Dedicated Database
sudo -u postgres psql << EOF
CREATE USER nexus_admin WITH ENCRYPTED PASSWORD 'YOUR_STRONG_DB_PASSWORD';
CREATE DATABASE nexus_platform OWNER nexus_admin;
GRANT ALL PRIVILEGES ON DATABASE nexus_platform TO nexus_admin;
\c nexus_platform
GRANT ALL ON SCHEMA public TO nexus_admin;
EOF
```

### 4.2 Executing Migrations in Sequence

The platform database structure is managed via ordered SQL migrations located in [`backend/src/database/migrations/`](file:///home/roy/Desktop/test/backend/src/database/migrations):

```bash
# Navigate to backend directory
cd /var/www/nexus/backend

# Run migration script which applies all migrations (001 to 011) sequentially:
npm run db:migrate
```

#### Migration Manifest:
- `001_initial_schema.sql`: Core tables (`users`, `developers`, `clients`, `projects`, `claims`)
- `002_credit_economy.sql`: Double-entry credit accounts, ledgers, and transactions
- `003_anonymous_chat.sql`: Shielded conversations, messages, and attachment storage
- `004_proposals_system.sql`: Developer bidding, milestone proposals, and client selections
- `005_ratings_reviews.sql`: Verified post-completion client reviews
- `006_notifications_system.sql`: Multi-channel in-app notification records
- `007_audit_logging.sql`: Tamper-evident governance audit trail
- `008_platform_settings.sql`: Dynamic platform configurations
- `009_developer_community.sql`: Channels, threads, reactions, and developer interactions
- `010_support_tickets_enhancement.sql`: 7-stage lifecycle, SLA tracking, and sealed bridge support
- `011_support_operations_and_staff_management.sql`: Support staff workload, routing, and teams

### 4.3 Production Seed & Leadership Initialization

Populate initial system leadership (CEO Ritesh Lingamallu, MD M. Shiva Gopi, initial skills, and Client #001):

```bash
npm run db:seed
```

### 4.4 Automated Database Backup Strategy

Create a daily automated backup script `/usr/local/bin/backup-nexus-db.sh`:

```bash
sudo tee /usr/local/bin/backup-nexus-db.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/nexus-postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="nexus_platform"
DB_USER="nexus_admin"

mkdir -p $BACKUP_DIR
pg_dump -U $DB_USER -h 127.0.0.1 -d $DB_NAME | gzip > "$BACKUP_DIR/nexus_backup_$TIMESTAMP.sql.gz"

# Retain backups for 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
EOF

sudo chmod +x /usr/local/bin/backup-nexus-db.sh

# Register in root crontab to run daily at 02:00 AM
(sudo crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-nexus-db.sh") | sudo crontab -
```

---

## 5. Deployment Method 1: Bare-Metal / VPS with PM2 & Nginx (Recommended)

### 5.1 Clone Repository and Install Dependencies

```bash
# Clone repository into web directory
sudo mkdir -p /var/www/nexus
sudo chown -R $USER:$USER /var/www/nexus
git clone https://github.com/your-org/developer-company-platform.git /var/www/nexus
cd /var/www/nexus

# Install all workspace dependencies
npm ci
```

### 5.2 Build Backend & Frontend for Production

```bash
# Build backend TypeScript into /dist
npm run build --workspace=backend

# Build Next.js production standalone bundle
npm run build --workspace=frontend
```

### 5.3 Configure PM2 Process Management

Create an ecosystem orchestration configuration file `/var/www/nexus/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'nexus-backend',
      cwd: '/var/www/nexus/backend',
      script: 'dist/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      error_file: '/var/log/nexus/backend-err.log',
      out_file: '/var/log/nexus/backend-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'nexus-frontend',
      cwd: '/var/www/nexus/frontend',
      script: '.next/standalone/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
        INTERNAL_API_URL: 'http://127.0.0.1:5000',
      },
      max_memory_restart: '1G',
      error_file: '/var/log/nexus/frontend-err.log',
      out_file: '/var/log/nexus/frontend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

Ensure log directory exists:
```bash
sudo mkdir -p /var/log/nexus
sudo chown -R $USER:$USER /var/log/nexus
```

### 5.4 Launch Services & Configure Startup

```bash
# Start applications with PM2 in production mode
pm2 start ecosystem.config.cjs --env production

# Save running process list
pm2 save

# Generate and configure systemd startup service
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

---

## 6. Nginx VirtualHost & Reverse Proxy Configuration

Create the Nginx configuration file `/etc/nginx/sites-available/nexus.dev`:

```nginx
# Rate limiting zone: 20 requests per second per IP
limit_req_zone $binary_remote_addr zone=nexus_limit:10m rate=20r/s;

# Upstream for Next.js App
upstream nextjs_upstream {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Upstream for Express API & WebSocket
upstream backend_upstream {
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name nexus.dev www.nexus.dev;

    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nexus.dev www.nexus.dev;

    # SSL Certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/nexus.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexus.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Performance & Payload Size
    client_max_body_size 50M;
    client_body_buffer_size 128k;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # 1. Express API Direct Proxy
    location /api/ {
        limit_req zone=nexus_limit burst=50 nodelay;
        proxy_pass http://backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # 2. WebSocket Realtime Proxy (/ws)
    location /ws {
        proxy_pass http://backend_upstream/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 3. Next.js Static Cache Optimization
    location /_next/static/ {
        alias /var/www/nexus/frontend/.next/static/;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # 4. Next.js Application Proxy
    location / {
        proxy_pass http://nextjs_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and test configuration:
```bash
sudo ln -s /etc/nginx/sites-available/nexus.dev /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5.5 Obtain Free SSL Certificates via Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d nexus.dev -d www.nexus.dev
```

---

## 7. Deployment Method 2: Docker & Docker Compose

For containerized cloud deployments (AWS ECS, DigitalOcean Droplets, GCP Compute Engine):

### 7.1 Verify `docker-compose.yml`

The repository includes a ready-to-use production orchestration stack:

```bash
# Start complete stack with detached background containers
docker compose up -d --build
```

### 7.2 Run Database Migrations in Container

```bash
# Execute migrations inside the backend container
docker compose exec backend npm run db:migrate

# Seed initial leadership accounts
docker compose exec backend npm run db:seed
```

### 7.3 Inspect Running Containers

```bash
docker compose ps
docker compose logs -f backend
```

---

## 8. Post-Deployment Verification & Smoke Testing Checklist

Execute the following sequential verifications immediately following deployment:

| Step | Action | Command / URL | Expected Result |
| :---: | :--- | :--- | :--- |
| **1** | **Backend Health Check** | `curl -I https://nexus.dev/api/health` | `HTTP/1.1 200 OK` |
| **2** | **Frontend Homepage** | `curl -I https://nexus.dev/` | `HTTP/1.1 200 OK` |
| **3** | **Robots & Privacy Tagging** | `curl -s https://nexus.dev/dashboard/support \| grep -i "X-Robots-Tag"` | `noindex, nofollow, noarchive` |
| **4** | **Public Marketplace Projects** | `curl -s https://nexus.dev/api/projects/published` | Returns JSON array of published projects |
| **5** | **WebSocket Connection** | `wscat -c wss://nexus.dev/ws?token=VALID_JWT` | Successfully connects and returns `authenticated` payload |
| **6** | **CEO / MD Login** | Login at `https://nexus.dev/login` as `ritesh@nexus.dev` | Lands on `/admin/dashboard` with executive controls |
| **7** | **Client #001 Login** | Login as `client001@apexretail.io` | Lands on `/dashboard` with 18 projects loaded |
| **8** | **Create Support Ticket** | Create ticket on `/dashboard/support` | Ticket created, SLA targets computed, Support Bridge created |

---

## 9. Operations, Updates & Troubleshooting

### Zero-Downtime Rolling Update Procedure

When pushing updates to production:

```bash
cd /var/www/nexus

# 1. Pull latest code from main branch
git pull origin main

# 2. Install any newly added dependencies
npm ci

# 3. Apply database migrations if any new migration files exist
npm run db:migrate --workspace=backend

# 4. Build both frontend and backend
npm run build

# 5. Zero-downtime rolling restart via PM2
pm2 reload ecosystem.config.cjs --env production
```

### Common Troubleshooting Scenarios

#### Scenario 1: `listen EADDRINUSE: address already in use :::5000`
- **Cause**: An orphaned backend Node process is holding port 5000.
- **Solution**:
  ```bash
  sudo lsof -i :5000
  sudo kill -9 <PID>
  pm2 restart nexus-backend
  ```

#### Scenario 2: `Fetch Error: Failed to fetch` or `Authentication required. No token provided.`
- **Cause**: Client requests are hitting cross-origin ports directly without JWT Bearer tokens or backend is unreachable.
- **Solution**: Ensure `frontend/lib/api-client.ts` uses relative `/api` paths and verify Nginx reverse proxy rewrite `proxy_pass http://backend_upstream;`. Verify user is logged in via `/login`.

#### Scenario 3: WebSocket connection closes immediately (`1006 abnormal closure`)
- **Cause**: Missing `Upgrade` and `Connection "upgrade"` headers in Nginx reverse proxy.
- **Solution**: Check `/etc/nginx/sites-available/nexus.dev` and confirm the `location /ws` block has `proxy_set_header Upgrade $http_upgrade;` and `proxy_read_timeout 86400s;`.
