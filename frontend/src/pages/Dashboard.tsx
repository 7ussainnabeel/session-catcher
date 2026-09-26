import React, { useEffect, useState } from 'react';
import { apiFetch, MonitoringJob, Session, AuditLog, getAccessToken } from '../utils/api';
import { BrowserViewer } from '../components/BrowserViewer';
import { 
  Play, 
  Pause, 
  Trash2, 
  ExternalLink, 
  Eye, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Terminal,
  Activity,
  UserCheck,
  Puzzle,
  Download,
  ShieldCheck,
  Search,
  X
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [jobs, setJobs] = useState<MonitoringJob[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Recommended Default Job Configuration
  const DEFAULT_JOB_CONFIG = {
    name: 'Hajj Platform Registration',
    targetUrl: 'https://haj.gov.bh/home',
    interval: 15,
    maxRetries: 100,
    timeout: 30,
    expectedText: '',
    expectedElement: 'a[href*="/register"]',
    expectedTitle: 'نظام تسجيل الحج',
    expectedUrl: '',
    expectedStatus: '' as number | '',
  };

  // Create Job Form State with Recommended Defaults
  const [jobName, setJobName] = useState(DEFAULT_JOB_CONFIG.name);
  const [targetUrl, setTargetUrl] = useState(DEFAULT_JOB_CONFIG.targetUrl);
  const [interval, setIntervalVal] = useState(DEFAULT_JOB_CONFIG.interval);
  const [expectedText, setExpectedText] = useState(DEFAULT_JOB_CONFIG.expectedText);
  const [expectedElement, setExpectedElement] = useState(DEFAULT_JOB_CONFIG.expectedElement);
  const [expectedTitle, setExpectedTitle] = useState(DEFAULT_JOB_CONFIG.expectedTitle);
  const [expectedUrl, setExpectedUrl] = useState(DEFAULT_JOB_CONFIG.expectedUrl);
  const [expectedStatus, setExpectedStatus] = useState<number | ''>(DEFAULT_JOB_CONFIG.expectedStatus);
  const [maxRetries, setMaxRetries] = useState(DEFAULT_JOB_CONFIG.maxRetries);
  const [timeout, setTimeoutVal] = useState(DEFAULT_JOB_CONFIG.timeout);
  const [creating, setCreating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const resetToRecommendedDefaults = () => {
    setJobName(DEFAULT_JOB_CONFIG.name);
    setTargetUrl(DEFAULT_JOB_CONFIG.targetUrl);
    setIntervalVal(DEFAULT_JOB_CONFIG.interval);
    setMaxRetries(DEFAULT_JOB_CONFIG.maxRetries);
    setTimeoutVal(DEFAULT_JOB_CONFIG.timeout);
    setExpectedText(DEFAULT_JOB_CONFIG.expectedText);
    setExpectedElement(DEFAULT_JOB_CONFIG.expectedElement);
    setExpectedTitle(DEFAULT_JOB_CONFIG.expectedTitle);
    setExpectedUrl(DEFAULT_JOB_CONFIG.expectedUrl);
    setExpectedStatus(DEFAULT_JOB_CONFIG.expectedStatus);
  };

  const fetchDashboardData = async () => {
    try {
      const jobsData = await apiFetch('/jobs');
      const sessionsData = await apiFetch('/sessions');
      const logsData = await apiFetch('/logs');
      setJobs(jobsData || []);
      setSessions(sessionsData || []);
      setLogs(logsData || []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pingInterval: any = null;
    let isUnmounted = false;

    let retryAttempt = 0;

    const connectWebSocket = () => {
      if (isUnmounted) return;
      const token = getAccessToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws/dashboard?token=${token}`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        retryAttempt = 0;
        // Send periodic heartbeat ping every 25s
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'log') {
            setLogs((prev) => [parsed.data, ...prev.filter(l => l.id !== parsed.data.id)].slice(0, 100));
          }
          if (parsed.type === 'job_status_change' || parsed.type === 'session_update') {
            fetchDashboardData();
          }
        } catch (err){}
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!isUnmounted) {
          const delay = Math.min(3000 * Math.pow(1.5, retryAttempt), 15000);
          retryAttempt++;
          reconnectTimeout = setTimeout(connectWebSocket, delay);
        }
      };

      ws.onerror = () => {
        if (ws) ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          name: jobName,
          target_url: targetUrl,
          refresh_interval: Number(interval),
          expected_text: expectedText || null,
          expected_element: expectedElement || null,
          expected_title: expectedTitle || null,
          expected_url: expectedUrl || null,
          expected_http_response: expectedStatus ? Number(expectedStatus) : null,
          max_retries: Number(maxRetries),
          timeout: Number(timeout),
        }),
      });
      setShowCreateModal(false);
      resetToRecommendedDefaults();
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message || 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  const handleJobAction = async (jobId: number, action: 'start' | 'pause' | 'stop' | 'delete') => {
    setActionLoadingId(jobId);
    try {
      if (action === 'delete') {
        if (confirm('Are you sure you want to delete this monitoring job?')) {
          await apiFetch(`/jobs/${jobId}`, { method: 'DELETE' });
        }
      } else {
        await apiFetch(`/jobs/${jobId}/${action}`, { method: 'POST' });
      }
      await fetchDashboardData();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} job`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full"><Clock size={12} /> Monitoring</span>;
      case 'success':
        return <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} /> Success (Reserved)</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full"><AlertCircle size={12} /> Failed</span>;
      case 'paused':
      default:
        return <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full"><Pause size={12} /> Paused</span>;
    }
  };

  return (
    <div className="space-y-8 relative">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-400">Manage persistent session checkers, remote browser reserves, and extension telemetry.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExtensionModal(true)}
            className="glass-button-secondary px-3.5 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold"
            title="Download & configure the Chrome/Edge extension"
          >
            <Puzzle size={15} className="text-cyan-400" />
            Browser Extension
          </button>

          <button
            onClick={() => {
              resetToRecommendedDefaults();
              setShowCreateModal(true);
            }}
            className="glass-button px-4 py-2.5 flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={16} />
            New Monitoring Job
          </button>
        </div>
      </div>

      {/* Analytics/Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Active Checkers</span>
            <p className="text-2xl font-bold">{jobs.filter(j => j.status === 'active').length}</p>
          </div>
          <Activity className="text-blue-500" size={32} />
        </div>

        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Reserved Sessions</span>
            <p className="text-2xl font-bold">{sessions.filter(s => s.status === 'active').length}</p>
          </div>
          <UserCheck className="text-green-500" size={32} />
        </div>

        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Total Configured Jobs</span>
            <p className="text-2xl font-bold">{jobs.length}</p>
          </div>
          <Clock className="text-zinc-500" size={32} />
        </div>
      </div>

      {/* Main Monitoring Jobs List */}
      <div className="glass-panel bg-zinc-950/30 border border-zinc-800/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-zinc-100">Monitoring Engines</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/60 text-zinc-400 font-mono">
              {jobs.filter(j => !searchQuery.trim() || j.name.toLowerCase().includes(searchQuery.toLowerCase()) || j.target_url.toLowerCase().includes(searchQuery.toLowerCase()) || j.status.toLowerCase().includes(searchQuery.toLowerCase()) || j.id.toString().includes(searchQuery.toLowerCase())).length} of {jobs.length}
            </span>
          </div>

          {/* Search bar above the list */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, URL, or status..."
              className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 rounded transition-colors"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 text-sm">
            No monitoring jobs configured. Click "New Monitoring Job" to get started.
          </div>
        ) : jobs.filter(j => !searchQuery.trim() || j.name.toLowerCase().includes(searchQuery.toLowerCase()) || j.target_url.toLowerCase().includes(searchQuery.toLowerCase()) || j.status.toLowerCase().includes(searchQuery.toLowerCase()) || j.id.toString().includes(searchQuery.toLowerCase())).length === 0 ? (
          <div className="text-center py-16 text-zinc-500 text-sm flex flex-col items-center gap-2">
            <p>No monitoring engines match "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-400 uppercase font-semibold bg-zinc-900/10">
                  <th className="w-14 px-4 py-3.5 text-center">#</th>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Target URL</th>
                  <th className="px-6 py-3.5">Interval</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-sm">
                {jobs
                  .filter(j => !searchQuery.trim() || j.name.toLowerCase().includes(searchQuery.toLowerCase()) || j.target_url.toLowerCase().includes(searchQuery.toLowerCase()) || j.status.toLowerCase().includes(searchQuery.toLowerCase()) || j.id.toString().includes(searchQuery.toLowerCase()))
                  .map((job, index) => (
                  <tr key={job.id} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="w-14 px-4 py-4 text-center font-mono text-xs text-zinc-500 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 font-medium text-zinc-200">{job.name}</td>
                    <td className="px-6 py-4 text-zinc-400 max-w-xs truncate" title={job.target_url}>
                      {job.target_url}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">{job.refresh_interval}s</td>
                    <td className="px-6 py-4">{getStatusBadge(job.status)}</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      
                      {/* SETUP BUTTON: Open browser to log in manually before monitoring */}
                      {job.status === 'paused' && (
                        <button
                          onClick={async () => {
                            // First trigger starting the container for manual session
                            await handleJobAction(job.id, 'start');
                            setActiveJobId(job.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1 transition-all"
                        >
                          <ExternalLink size={12} />
                          Setup Login
                        </button>
                      )}

                      {/* START / PAUSE CONTROLS */}
                      {job.status === 'paused' || job.status === 'failed' || job.status === 'finished' ? (
                        <button
                          disabled={actionLoadingId === job.id}
                          onClick={() => handleJobAction(job.id, 'start')}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          {actionLoadingId === job.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                          Monitor
                        </button>
                      ) : job.status === 'active' ? (
                        <>
                          {/* LIVE VIEW WHILE MONITORING */}
                          <button
                            onClick={() => setActiveJobId(job.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-blue-900/20"
                            title="View live browser stream while monitoring"
                          >
                            <Eye size={12} />
                            Live View
                          </button>
                          <button
                            disabled={actionLoadingId === job.id}
                            onClick={() => handleJobAction(job.id, 'pause')}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1 transition-all"
                          >
                            <Pause size={12} />
                            Pause
                          </button>
                        </>
                      ) : null}

                      {/* RECONNECT: If successful match occurs, connect to the browser */}
                      {job.status === 'success' && (
                        <>
                          <button
                            onClick={() => setActiveJobId(job.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-green-900/20 animate-pulse"
                          >
                            <Eye size={12} />
                            Reconnect
                          </button>
                          <button
                            onClick={() => handleJobAction(job.id, 'stop')}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all border border-zinc-700"
                          >
                            Release
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleJobAction(job.id, 'delete')}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two column Grid: Screenshots & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Active Session & Screenshot lists */}
        <div className="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4">
          <h3 className="text-base font-bold text-zinc-100">Reserved Sessions & Captures</h3>
          
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-500">No session screenshots captured yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sessions.map((session) => (
                <div key={session.id} className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-2.5">
                  <div className="relative aspect-video bg-zinc-900 rounded-md overflow-hidden border border-zinc-800">
                    {session.screenshot_path ? (
                      <img src={session.screenshot_path} alt="Success Screenshot" className="object-cover w-full h-full hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-zinc-600">No Image</div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-400 font-semibold truncate max-w-[120px]" title={`Job ID: ${session.job_id}`}>
                      Session #{session.id}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(session.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {session.screenshot_path && (
                    <a
                      href={session.screenshot_path}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="glass-button-secondary py-1 text-center text-xs font-semibold block rounded"
                    >
                      Download Capture
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Real-time System Audit Logs */}
        <div className="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4 overflow-hidden h-[380px]">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Terminal size={16} className="text-blue-500" />
              Activity Console
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-xs text-zinc-400 space-y-2.5 pr-2">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-zinc-600">Console listening for logs...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2.5 border-b border-zinc-900/40 pb-1.5 leading-relaxed">
                  <span className="text-zinc-600 shrink-0">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                  <span className={`font-semibold shrink-0 uppercase tracking-wide text-[10px] ${
                    log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-zinc-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CREATE JOB DIALOG MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="glass-panel w-full max-w-xl p-6 bg-zinc-950/90 border border-zinc-800 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold text-zinc-100 mb-4">Configure Monitoring Job</h3>
            
            <form onSubmit={handleCreateJob} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-400">Job Name</label>
                  <input
                    type="text"
                    required
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="Hajj Platform Registration"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-400">Target URL</label>
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://haj.gov.bh/home"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-400">Check Interval (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    required
                    value={interval}
                    onChange={(e) => setIntervalVal(Number(e.target.value))}
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-400">Max Retries</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(Number(e.target.value))}
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-400">Page Timeout (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    required
                    value={timeout}
                    onChange={(e) => setTimeoutVal(Number(e.target.value))}
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <hr className="border-zinc-800" />
              <p className="text-xs font-bold text-zinc-300">Match Criteria (Evaluated against page when live)</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Expected Text on Page</label>
                  <input
                    type="text"
                    value={expectedText}
                    onChange={(e) => setExpectedText(e.target.value)}
                    placeholder="تقديم طلب التسجيل or بدء التسجيل"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Expected Element Selector</label>
                  <input
                    type="text"
                    value={expectedElement}
                    onChange={(e) => setExpectedElement(e.target.value)}
                    placeholder="a[href*='/register'] or .registration-menu"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Expected Page Title</label>
                  <input
                    type="text"
                    value={expectedTitle}
                    onChange={(e) => setExpectedTitle(e.target.value)}
                    placeholder="نظام تسجيل الحج"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Expected Success URL</label>
                  <input
                    type="text"
                    value={expectedUrl}
                    onChange={(e) => setExpectedUrl(e.target.value)}
                    placeholder="/booking-confirmed"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">Expected HTTP Status Response</label>
                  <input
                    type="number"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value ? Number(e.target.value) : '')}
                    placeholder="200"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="glass-button-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="glass-button px-5 py-2 text-xs flex items-center gap-1.5"
                >
                  {creating && <Loader2 size={12} className="animate-spin" />}
                  Save Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXTENSION COMPANION MODAL */}
      {showExtensionModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="glass-panel w-full max-w-xl p-6 bg-zinc-950/95 border border-zinc-800 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Puzzle className="text-cyan-400" size={20} />
                <h3 className="text-lg font-bold text-zinc-100">Hajj Portal Session & Queue Assistant</h3>
              </div>
              <button onClick={() => setShowExtensionModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              The official Manifest V3 extension runs natively in your personal browser (Chrome / Edge) to maintain persistent session heartbeats, track real-time queue position, and alert you with audio chimes the instant registration becomes available on <code className="text-cyan-400">https://haj.gov.bh/</code>.
            </p>

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-zinc-200">Download Extension Package</span>
                <span className="text-[11px] text-zinc-400">Ready to load in Chrome or Edge (Manifest V3)</span>
              </div>
              <a
                href="/api/extension/download"
                download="hajj-session-queue-assistant.zip"
                className="glass-button px-4 py-2 text-xs flex items-center gap-2 whitespace-nowrap"
              >
                <Download size={14} />
                Download ZIP Bundle
              </a>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Installation Steps (Google Chrome & Microsoft Edge):</h4>
              <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-1.5 pl-1 leading-relaxed">
                <li>Download and extract the <code className="text-zinc-300">hajj-session-queue-assistant.zip</code> file.</li>
                <li>Navigate to <code className="text-cyan-400 font-mono">chrome://extensions/</code> or <code className="text-cyan-400 font-mono">edge://extensions/</code> in your browser.</li>
                <li>Enable <strong>Developer mode</strong> using the toggle in the top corner.</li>
                <li>Click <strong>Load unpacked</strong> and select the extracted extension folder.</li>
                <li>Open <code className="text-cyan-400 font-mono">https://haj.gov.bh/</code>, log in with eKey, and click <strong>[ START ASSISTANT ]</strong> in the extension popup.</li>
              </ol>
            </div>

            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-3 flex items-start gap-2.5">
              <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={16} />
              <p className="text-[11px] text-emerald-300 leading-relaxed">
                <strong>Privacy Certified:</strong> No passwords, OTPs, CPR numbers, or cookie values are stored or sent externally. All keep-alive pulses use genuine browser sessions.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowExtensionModal(false)}
                className="glass-button-secondary px-5 py-2 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROWSER INTERACTIVE CDP VIEW PORTAL */}
      {activeJobId !== null && (
        <BrowserViewer
          jobId={activeJobId}
          jobName={jobs.find((j) => j.id === activeJobId)?.name}
          onClose={() => {
            setActiveJobId(null);
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
};
