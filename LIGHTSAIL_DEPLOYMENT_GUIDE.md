# Deploying Scout to AWS Lightsail — A Windows Developer's Guide

This is a from-scratch, step-by-step guide for deploying this app (Next.js + Postgres/pgvector) to an AWS Lightsail Ubuntu instance. It assumes you're comfortable with Windows and PowerShell but new to Linux, so each step explains *what* you're doing and *why*, not just the command to paste.

**Assumptions matching your setup:**
- Lightsail instance: Ubuntu 22.04, 2GB+ RAM, with a **static IP already attached**
- You connect from your Windows machine via `ssh` using a private key file (not a password)
- Embeddings and LLM both use Gemini (no local Ollama needed)
- You're deploying just the main app + database for now (not the `http-api/` microservices)
- No domain name yet — you'll access the app via `http://<static-ip>:3000`

---

## Part 0: A 5-Minute Linux Primer

A few concepts that'll make the rest of this guide make sense, if Linux is new to you:

- **SSH** is like Remote Desktop, except text-only. You type commands, the server runs them, and you see the output — there's no window/desktop involved. Once connected, everything you type runs *on the server*, not on your Windows machine.
- **`sudo`** means "run this one command as an administrator." It's the Linux equivalent of right-click → "Run as Administrator", but applied per-command instead of per-application. You'll be prompted for your password the first time in a session.
- **`apt`** is Ubuntu's package manager — think of it like `winget` or a Linux Store. `sudo apt install <package>` downloads and installs software.
- **Paths use forward slashes** (`/var/www/scout`, not `C:\var\www\scout`), and **Linux is case-sensitive** — `Scout` and `scout` are different paths.
- **`~`** means your home directory (`/home/ubuntu`), same idea as `%USERPROFILE%` on Windows.
- Commands run in **bash**, the default Linux shell. It's conceptually like PowerShell, but with different syntax — `&&` chains commands like in PowerShell, but variables are `$VAR` not `$env:VAR`, and there's no `Get-ChildItem`-style verbosity; most things are terse two/three-letter commands (`ls`, `cd`, `cp`, `rm`).
- There is no Recycle Bin. `rm` deletes immediately and permanently. Commands in this guide are written to be safe, but always read a command before pasting it somewhere else.

---

## Part 1: Connect to Your Instance

From PowerShell on your Windows machine:

```powershell
ssh -i "C:\path\to\your-key.pem" ubuntu@<your-static-ip>
```

- `-i` points at your **private key file** — this is how Lightsail authenticates you instead of a password (much more secure, and it's why you don't get prompted for a password).
- `ubuntu` is the default username for Ubuntu-blueprint Lightsail instances.
- If you get `Permission denied (publickey)`, you're either pointing at the wrong key file, or the instance uses a different key pair than you think — check the instance's details page in the Lightsail console for which key it expects.

Once connected, your prompt will change to something like `ubuntu@ip-172-26-x-x:~$` — that confirms you're now typing commands that run **on the Lightsail server**, not on Windows.

---

## Part 2: Install Node.js, Git, and Build Tools

```bash
sudo apt update && sudo apt upgrade -y
```
`update` refreshes the list of available package versions; `upgrade` actually installs newer versions of anything already on the system. Good habit to run this first on a fresh box.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
node -v
```
This adds NodeSource's package repository (so `apt` knows where to find a current Node.js, since Ubuntu's own repos usually lag behind) and installs Node 20+, `git`, and `build-essential` (C/C++ compiler toolchain some npm packages need to compile native addons during `npm install`). `node -v` should print something like `v20.x.x` to confirm.

---

## Part 3: Install Docker (for Postgres)

The app doesn't need Docker for itself — only for running Postgres with the `pgvector` extension via this repo's existing `docker-compose.yml`.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```
The second command adds your user to the `docker` group so you don't need `sudo` before every `docker` command. **This only takes effect on your next login**, so:
```bash
exit
```
then reconnect with the same `ssh -i ...` command from Part 1.

---

## Part 4: Clone the Repository

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/gautam2009baruah/scout.git scout
cd scout
```
`/var/www` is a Linux convention for "web application files live here" — not a hard requirement, just where this guide puts things. If the repo is private, `git clone` will prompt for credentials — use a [GitHub personal access token](https://github.com/settings/tokens) as the password.

---

## Part 5: Start Postgres

```bash
cp .env.example .env.local
docker compose --env-file .env.local up -d postgres
docker compose ps
```
- `docker compose up -d postgres` starts *only* the `postgres` service from `docker-compose.yml` (it also defines an `ollama` service you don't need — naming it explicitly skips that).
- `-d` means "detached" — it runs in the background instead of tying up your terminal.
- `pgvector` (the Postgres extension for AI embeddings) is enabled automatically on first boot via `docker/postgres/init/001-enable-pgvector.sql`.
- `docker compose ps` should show `scout-postgres` as `healthy` after a few seconds.

**Change the default database password** before going further — edit `.env.local` (see Part 6) and set a real `POSTGRES_PASSWORD`, then:
```bash
docker compose down
docker compose --env-file .env.local up -d postgres
```

---

## Part 6: Configure `.env.local`

```bash
nano .env.local
```
`nano` is a simple terminal text editor. Arrow keys to move, type to edit, `Ctrl+O` then `Enter` to save, `Ctrl+X` to exit.

Set these values:

```bash
DATABASE_URL="postgresql://scout:<your-new-password>@localhost:5432/scout"
APP_BASE_URL="http://<your-static-ip>:3000"

# Embeddings — Gemini
EMBEDDING_PROVIDER=gemini
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents
EMBEDDING_DIMENSIONS=768
EMBEDDING_API_KEY=<your-gemini-api-key>

# LLM — Gemini
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
LLM_API_KEY=<your-gemini-api-key>

# Storage
STORAGE_PROVIDER=local
STORAGE_ROOT=/var/www/scout/storage
```

**Important:** these `EMBEDDING_*`/`LLM_*` values are only a *fallback*. Once you log into the app and set a provider through **Admin → Administration → AI Configuration**, that database row takes over completely and the env vars stop mattering. See Part 8 for creating your first login.

Also update `POSTGRES_PASSWORD` here to match whatever you set in Part 5.

---

## Part 7: Install Dependencies, Build the Schema, Build the App

```bash
npm install
npm run db:migrate
```
`db:migrate` builds the entire database schema from a single file (`db/migrations/001_baseline_schema.sql`) — it's been squashed down from what used to be 143 incremental files, so this should complete in a few seconds with just one line of output: `Applied 001_baseline_schema.sql.`

```bash
npm run build
```
This compiles the production build. On a 2GB instance this can be memory-tight — if it fails with an out-of-memory error, add swap space first (lets the system use disk as overflow memory):
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
then re-run `npm run build`.

---

## Part 8: Create Your First Admin User

There's no seed script for this — you create the first company, admin role, and user directly via SQL. This is a two-step process: generate a password hash, then run one SQL script with it.

**Step 1 — generate a password hash.** The app hashes passwords with Node's built-in `scrypt` (no external library). Run this, replacing the password with your own (must be 8+ characters, with a letter, a digit, and a special character):

```bash
node -e "
const crypto = require('crypto');
const password = 'YourStrongPassword123!';
const salt = crypto.randomBytes(16).toString('hex');
const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
console.log('scrypt\$16384\$8\$1\$' + salt + '\$' + key);
"
```
Copy the printed output (a long string starting with `scrypt$16384$8$1$...`) — you'll paste it into the next command.

**Step 2 — create the company, admin role, and user in one transaction:**
```bash
docker exec -i scout-postgres psql -U scout -d scout <<'EOF'
WITH new_company AS (
  INSERT INTO companies (name, slug)
  VALUES ('YourCompany', 'yourcompany')
  RETURNING id
), new_role AS (
  INSERT INTO roles (name, company_id, is_admin_role, is_system)
  SELECT 'Owner Admin', id, true, true FROM new_company
  RETURNING id, company_id
), new_user AS (
  INSERT INTO users (name, email, password_hash, status)
  VALUES ('Admin User', lower('admin@yourcompany.com'), 'PASTE_YOUR_HASH_HERE', 'active')
  RETURNING id
)
INSERT INTO user_company_roles (user_id, company_id, role_id, status, is_primary)
SELECT new_user.id, new_role.company_id, new_role.id, 'active', true
FROM new_user, new_role
RETURNING user_id, company_id, role_id;
EOF
```
Before running: replace `YourCompany`/`yourcompany`, `Admin User`/`admin@yourcompany.com`, and `PASTE_YOUR_HASH_HERE` (with the full hash string from Step 1, including the `$` characters as-is — no extra escaping needed inside the `<<'EOF' ... EOF` block).

`is_system = true` on the role is what grants full access to every admin module automatically, without needing to individually grant each one — this was verified against the app's actual permission-resolution code (`lib/admin/permissions.ts`'s `getEffectiveUserModules`), not guessed from the schema.

A successful run prints one row back, confirming the user/company/role are linked.

---

## Part 9: Run the App with PM2

**PM2** is a process manager for Node apps — the closest Windows analogy is a Windows Service: it keeps your app running in the background, restarts it if it crashes, and can be configured to start automatically on server reboot.

```bash
sudo npm install -g pm2
pm2 start npm --name "scout" -- start
```

This app also has background workers for scheduled/email orchestration triggers and document processing — start those too, or those features silently won't run:
```bash
pm2 start npm --name "scout-jobs" -- run jobs:worker
pm2 start npm --name "scout-triggers-schedule" -- run triggers:schedule
pm2 start npm --name "scout-triggers-email" -- run triggers:email
```

Save the process list and enable auto-start on reboot:
```bash
pm2 save
pm2 startup
```
`pm2 startup` prints a `sudo ...` command — copy and run that exact line it gives you (it registers PM2 as a systemd service).

Useful commands going forward:
```bash
pm2 list              # see what's running
pm2 logs scout         # tail logs for the main app
pm2 restart scout      # restart after a code change
```

---

## Part 10: Verify It's Working

```bash
curl -I http://localhost:3000
```
Should return `HTTP/1.1 200 OK` (or a redirect). Then from your Windows browser:

```
http://<your-static-ip>:3000/control-panel/login
```
Log in with the email/password you set in Part 8. Once in, go to **Administration → AI Configuration** to set your real Gemini keys through the UI (this is what actually takes effect going forward — see the note in Part 6).

If the page doesn't load: check the Lightsail console's **Networking** tab has a firewall rule for **TCP 3000**.

---

## Part 11: Deploying Updates Later

```bash
cd /var/www/scout
git pull origin main
npm install
npm run db:migrate
npm run build
pm2 restart scout scout-jobs scout-triggers-schedule scout-triggers-email
```

---

## Appendix A: Starting Completely Over

If something goes sideways and you want to reset the box to a blank slate (keeps Node/Docker/git installed, just tears down the app + database):

```bash
# Stop and remove all PM2-managed processes
pm2 delete all 2>/dev/null || true
pm2 unstartup 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Tear down Docker containers AND their data volumes
cd /var/www/scout 2>/dev/null && docker compose down -v 2>/dev/null || true
docker rm -f scout-postgres scout-ollama scout-ollama-init 2>/dev/null || true
docker volume rm scout-postgres-data scout-ollama-data 2>/dev/null || true

# Delete the cloned repo
cd ~ && sudo rm -rf /var/www/scout

# Remove the swap file, if you created one
sudo swapoff /swapfile 2>/dev/null || true
sudo rm -f /swapfile
sudo sed -i '/\/swapfile none swap sw 0 0/d' /etc/fstab

# Confirm clean state
pm2 list
docker ps -a
docker volume ls
ls /var/www 2>/dev/null || echo "(gone)"
```
Then start again from Part 4.

---

## Appendix B: Common Errors

| Symptom | Cause | Fix |
|---|---|---|
| `Permission denied (publickey)` on SSH | Wrong/missing key file | Use `-i path\to\key.pem`, or use the Lightsail console's browser-based SSH to get in and check which key pair the instance expects |
| `npm run build` killed / out of memory | 2GB RAM is tight for a Next.js build | Add swap space (Part 7) |
| Can't reach `http://<ip>:3000` in browser | Firewall port not open | Add a TCP 3000 rule in Lightsail's Networking tab |
| `docker: command not found` right after install | Group membership needs a fresh login | `exit` and reconnect via SSH |

---

## What's Deferred (Not in This Guide)

- **Domain name + HTTPS**: once you have a domain, point its A record at the static IP, put Nginx in front of port 3000 as a reverse proxy, and use `certbot --nginx` for a free TLS certificate. Then close port 3000 in the firewall and only expose 80/443.
- **The `http-api/` microservices** (chatbot embed widget, browser-extension sync, smart-finder, HTTP-trigger API): each has its own `<name>:start` npm script — same `pm2 start npm --name "<name>" -- run <name>:start` pattern, whenever you're ready to deploy them.
