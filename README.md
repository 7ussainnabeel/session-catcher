# Session Reserve

Session Reserve is a production-grade Full-Stack SaaS platform designed to automate browser logins, preserve authenticated sessions, monitor pages for target conditions, and allow users to securely reconnect to the live authenticated browser sessions in real-time.

---

## Features

- **Authenticated Session Monitoring**: Reuse user browser profiles to keep sessions authenticated (bypassing persistent login screens).
- **Interactive Remote Browser Canvas**: Connect directly to the worker's running Playwright browser using Chromium’s Chrome DevTools Protocol (CDP) WebSocket screen streaming, allowing keyboard and scaled mouse clicks natively.
- **Worker Pooling**: Pre-allocated and managed logical worker states tracking browser lifecycle: `Available`, `Assigned`, `Monitoring`, `Reserved`, `Disconnected`, `Finished`.
- **Match Criteria Rules Engine**: Triggers alerts on expected URL path, HTTP status, DOM elements, title, buttons, or page text.
- **Global Alerts Dispatcher**: Push notifications natively to Slack, Discord, Telegram Bot channels, Email inbox, and custom Webhooks.
- **Sleek Glassmorphism Dashboard**: Fully responsive dark mode UI featuring resource tracking (CPU/RAM/Disk), running containers, user suspension tools, and real-time activity logs.

---

## Technology Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **API Backend**: Python 3.12, FastAPI, AsyncIO, SQLAlchemy
- **Task Queue & Cache**: Celery, Redis
- **Database**: PostgreSQL 16
- **Browser Automation**: Playwright (Chromium)
- **Routing & Proxy**: Nginx

---

## Project Structure

```
session-reserve/
├── backend/                  # FastAPI Application codebase
│   ├── auth.py               # JWT Encryption & RBAC Dependency Checkers
│   ├── config.py             # Server Settings Loader
│   ├── database.py           # SQLAlchemy PG Connection Configuration
│   ├── models.py             # PostgreSQL Database Tables Definition
│   ├── schemas.py            # Pydantic Request Validation Models
│   ├── ws_manager.py         # Real-time WebSocket Proxy Tunnel (CDP)
│   └── main.py               # API Router and WebSocket Mounts
├── worker/                   # Celery Playwright Worker codebase
│   ├── worker.py             # Playwright monitoring loop & notifications
│   └── Dockerfile            # Jammy Playwright Base Image runner
├── frontend/                 # React SPA Vite typescript client
│   ├── src/
│   │   ├── components/       # Layout structure & CDP Canvas viewer
│   │   ├── hooks/            # useAuth authentication logic
│   │   ├── pages/            # Login, Register, Dashboard, Admin, Settings
│   │   └── utils/            # apiFetch client wrapper
│   └── tailwind.config.js    # Glassmorphism theme configurations
├── nginx/                    # Reverse Proxy routing config
│   ├── nginx.conf            # WebSocket & REST upstream routers
│   └── Dockerfile            # Multi-stage production compiler
├── docker-compose.yml        # Multi-container orchestration loader
└── README.md                 # Deployment & user manual documentation
```

---

## Deployment & Setup

### Prerequisites

Ensure you have the following installed on your host server (e.g., Ubuntu Server 24.04):
- Docker Engine (v24.0 or higher)
- Docker Compose (v2.0 or higher)

### Environment Variables

Configuration is loaded from environment variables defined inside `docker-compose.yml` or custom environment files:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection endpoint | `postgresql://postgres:sessionsecretpassword123@postgres/session_reserve` |
| `REDIS_URL` | Redis connection broker address | `redis://redis:6379/0` |
| `JWT_SECRET` | Secret key used to encrypt access/refresh tokens | `supercomplexsessionjwtsecretkey987654321` |
| `JWT_ALGORITHM` | JWT Signature Cryptographic Method | `HS256` |
| `MAX_WORKERS` | Limit on parallel running browsers / jobs | `5` |
| `PROFILES_DIR` | Directory containing user browser profiles | `/app/shared/browser-profiles` |
| `SCREENSHOTS_DIR` | Shared directory storing captured screenshots | `/app/shared/screenshots` |

---

### Step-by-Step Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/session-reserve.git
   cd session-reserve
   ```

2. **Boot up the containers**:
   ```bash
   docker compose up -d
   ```

3. **Check health status**:
   Verify that all service containers are running properly:
   ```bash
   docker compose ps
   ```

4. **Verify Application**:
   Navigate to `http://localhost/` in your browser. The first registered user will automatically be assigned the `admin` role.

---

## Backup & Restore

### Backing up the Database
To back up the PostgreSQL database schemas and data:
```bash
docker compose exec postgres pg_dump -U postgres session_reserve > backup_db_$(date +%F).sql
```

### Backing up Browser Profiles & Captures
Compress the shared volume directory to capture active session cookies and success screenshots:
```bash
docker compose exec backend tar -czf /app/shared/backup_files_$(date +%F).tar.gz -C /app/shared browser-profiles screenshots
```

### Restoring the Database
```bash
docker compose exec -T postgres psql -U postgres session_reserve < backup_db_YYYY-MM-DD.sql
```

### Restoring Profiles & Captures
```bash
docker compose exec backend tar -xzf /app/shared/backup_files_YYYY-MM-DD.tar.gz -C /app/shared
```

---

## API Documentation

FastAPI automatically generates an interactive swagger documentation suite. Once the project is running:
- **Swagger Documentation URL**: `http://localhost/api/docs`
- **JSON OpenAPI Schema**: `http://localhost/api/openapi.json`

### Key Endpoints

- `POST /api/auth/register` - Create user accounts and allocate notification setups.
- `POST /api/auth/login` - Obtain authorization and refresh tokens.
- `POST /api/jobs` - Create custom monitoring triggers.
- `POST /api/jobs/{id}/start` - Launch browser background execution.
- `POST /api/jobs/{id}/pause` - Hold running intervals.
- `GET /api/jobs/{id}/session` - Fetch active browser socket endpoints.
- `WS /api/ws/browser/{id}` - Bidirectional WebSocket CDP proxy endpoint.

---

## System Architecture Details

The interactive live browser session is achieved through the **Chrome DevTools Protocol (CDP)** using a custom WebSocket proxy bridge:

```
[React Canvas] 
     │ (Mouse coordinates scaled/translated & keystrokes)
     ▼
[Nginx Proxy] 
     │ (WS Upgrade router)
     ▼
[FastAPI WebSocket Endpoints]
     │ (Security authorization check)
     ▼
[CDP Tunnel Proxy Manager]
     │ (Bidirectional JSON streams)
     ▼
[Playwright Chromium Browser (Worker Container)]
```

When success conditions are met, the background loop freezes the browser context, registers the internal socket connection, updates the state machine to `RESERVED`, and serves screenshot images through the shared volume.

---

## Troubleshooting & FAQ

#### Browser fails to start / Chromium core errors
Ensure that your Docker host machine has enough memory allocation and that IPC namespace is set to `host` (`ipc: host` in `docker-compose.yml`). Chromium requires shared memory access for stability.

#### Connections timeout inside the browser view canvas
Verify Nginx reverse proxy configurations. Nginx must support websocket connection headers (`Upgrade` and `Connection`). Ensure that `proxy_read_timeout` is configured to `3600s` to prevent Nginx from severing connections due to inactivity.

#### Workers are full and cannot accept tasks
Check the `MAX_WORKERS` variable and active jobs in the Admin panel. If workers are stuck, you can restart the workers container:
```bash
docker compose restart worker
```
