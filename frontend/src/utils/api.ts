export interface User {
  id: number;
  email: string;
  role: string;
  is_suspended: boolean;
  created_at: string;
}

export interface MonitoringJob {
  id: number;
  user_id: number;
  name: string;
  target_url: string;
  refresh_interval: number;
  expected_text: string | null;
  expected_element: string | null;
  expected_button: string | null;
  expected_url: string | null;
  expected_http_response: number | null;
  expected_title: string | null;
  max_retries: number;
  timeout: number;
  status: 'active' | 'paused' | 'success' | 'failed' | 'finished';
  created_at: string;
  updated_at: string;
}

export interface NotificationSettings {
  id: number;
  user_id: number;
  email_enabled: boolean;
  email_address: string | null;
  telegram_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  discord_enabled: boolean;
  discord_webhook_url: string | null;
  slack_enabled: boolean;
  slack_webhook_url: string | null;
  webhook_enabled: boolean;
  webhook_url: string | null;
}

export interface Session {
  id: number;
  user_id: number;
  job_id: number;
  worker_id: number | null;
  status: 'active' | 'closed';
  screenshot_path: string | null;
  cdp_ws_url: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  job_id: number | null;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
}

export interface SystemStats {
  system: {
    cpu: number;
    ram: number;
    disk: number;
  };
  app: {
    users: number;
    running_browsers: number;
    active_jobs: number;
    reserved_sessions: number;
    total_workers: number;
  };
}

export interface WorkerInfo {
  id: number;
  name: string;
  status: string;
  current_job_id: number | null;
  browser_ws_url: string | null;
  host: string | null;
  port: number | null;
  last_ping: string;
}

const API_BASE = '/api';

export const getAccessToken = () => localStorage.getItem('access_token');
export const getRefreshToken = () => localStorage.getItem('refresh_token');

export const setTokens = (access: string, refresh: string) => {
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
};

export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getAccessToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 && getRefreshToken() && !path.includes('/auth/refresh')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getRefreshToken()}`
          }
        });
        if (refreshRes.ok) {
          const credentials = await refreshRes.json();
          setTokens(credentials.access_token, credentials.refresh_token);
          isRefreshing = false;
          onRefreshed(credentials.access_token);
        } else {
          clearTokens();
          isRefreshing = false;
          window.location.href = '/login';
          throw new Error('Session expired');
        }
      } catch (err) {
        clearTokens();
        isRefreshing = false;
        window.location.href = '/login';
        throw err;
      }
    }

    return new Promise((resolve) => {
      subscribeTokenRefresh((newToken) => {
        headers.set('Authorization', `Bearer ${newToken}`);
        resolve(
          fetch(`${API_BASE}${path}`, { ...options, headers }).then((res) => {
            if (!res.ok) throw res;
            return res.json();
          })
        );
      });
    });
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || 'Request failed');
  }

  // Handle empty bodies (e.g. DELETE returns nothing)
  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}
