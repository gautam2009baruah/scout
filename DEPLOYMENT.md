# Scout Deployment Guide

## Quick Deployment to Dev Server

### Prerequisites on Dev Server
- Node.js 20+
- PostgreSQL 12+ with pgvector extension enabled
- Git

### Step 1: Enable pgvector Extension

Connect to your PostgreSQL database and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Step 2: Clone/Pull Code

```bash
# Initial setup
git clone <your-repo-url> scout
cd scout

# Or update existing deployment
git pull origin main
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```bash
# Update these values for your server
DATABASE_URL="postgresql://username:password@localhost:5432/scout"
APP_BASE_URL="https://your-domain.com"

# SMTP for user activation emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM="Scout <noreply@yourcompany.com>"

# Storage
STORAGE_PROVIDER=local
STORAGE_ROOT=/var/www/scout/storage

# AI Configuration (Ollama or external)
EMBEDDING_PROVIDER=local_bge
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_ENDPOINT=http://localhost:11434/api/embed
EMBEDDING_DIMENSIONS=768

LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
LLM_ENDPOINT=http://localhost:11434

# First admin user
SEED_COMPANY_NAME=YourCompany
SEED_COMPANY_SLUG=yourcompany
SEED_ADMIN_NAME=Admin User
SEED_ADMIN_EMAIL=admin@yourcompany.com
SEED_ADMIN_PASSWORD=ChangeThisSecurePassword123!
```

### Step 5: Run Database Migrations

**This creates all tables, indexes, and schema automatically:**

```bash
npm run db:migrate
```

You should see:
```
Applied 001_admin_auth.sql.
Applied 002_master_data.sql.
Applied 003_employees.sql.
...
Applied 036_guided_workflow_training_sessions.sql.
Database migrations completed.
```

### Step 6: Seed First Admin User

```bash
npm run db:seed:first-admin
```

### Step 7: Build and Start

```bash
# Production build
npm run build

# Start production server
npm start
```

The app will run on port 3000 by default.

---

## Using PM2 for Process Management

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start npm --name "scout" -- start

# View logs
pm2 logs scout

# Restart
pm2 restart scout

# Start on system boot
pm2 startup
pm2 save
```

---

## Using Systemd Service

Create `/etc/systemd/system/scout.service`:

```ini
[Unit]
Description=Scout Chatbot Application
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/scout
Environment="NODE_ENV=production"
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable scout
sudo systemctl start scout
sudo systemctl status scout
```

---

## Nginx Reverse Proxy

Create `/etc/nginx/sites-available/scout`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

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
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/scout /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Background Job Worker

For document processing, run the job worker in a separate process:

```bash
# With PM2
pm2 start npm --name "scout-worker" -- run jobs:worker

# Or with systemd (create another service file)
```

---

## Database Migrations for New Features

When you add new database changes on your local machine:

1. **Create migration file:**
   ```bash
   # In db/migrations/
   # Name format: 037_your_feature_name.sql
   ```

2. **Write SQL:**
   ```sql
   -- Use IF NOT EXISTS for safety
   CREATE TABLE IF NOT EXISTS your_table (
     id SERIAL PRIMARY KEY,
     ...
   );
   
   ALTER TABLE existing_table 
   ADD COLUMN IF NOT EXISTS new_column TEXT;
   ```

3. **Commit to Git:**
   ```bash
   git add db/migrations/037_your_feature_name.sql
   git commit -m "Add new feature migration"
   git push
   ```

4. **Deploy to server:**
   ```bash
   git pull
   npm run db:migrate  # Automatically runs new migrations
   pm2 restart scout
   ```

---

## Troubleshooting

### Check Database Connection
```bash
psql $DATABASE_URL -c "SELECT version();"
```

### Check pgvector Extension
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### View Application Logs
```bash
# If using PM2
pm2 logs scout

# If using systemd
sudo journalctl -u scout -f
```

### Reset Database (DANGER - Deletes all data)
```bash
# Drop all tables
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migrations
npm run db:migrate
npm run db:seed:first-admin
```

---

## Access URLs

- **Admin Panel:** `https://your-domain.com/control-panel/login`
- **Homepage:** `https://your-domain.com`
- **Embed Demo:** `https://your-domain.com/embed-demo.html`

Login with credentials from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
