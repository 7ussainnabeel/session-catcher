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
  UserCheck
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [jobs, setJobs] = useState<MonitoringJob[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  
  // Create Job Form State
  const [jobName, setJobName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [interval, setIntervalVal] = useState(30);
  const [expectedText, setExpectedText] = useState('');
  const [expectedElement, setExpectedElement] = useState('');
  const [expectedTitle, setExpectedTitle] = useState('');
  const [expectedUrl, setExpectedUrl] = useState('');
  const [expectedStatus, setExpectedStatus] = useState<number | ''>('');
  const [maxRetries, setMaxRetries] = useState(10);
  const [timeout, setTimeoutVal] = useState(30);
  const [creating, setCreating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

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
    // Realtime logs listener via WebSockets
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/dashboard?token=${getAccessToken()}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'log') {
          setLogs((prev) => [parsed.data, ...prev].slice(0, 100));
        }
        if (parsed.type === 'job_status_change') {
          fetchDashboardData();
        }
      } catch (err){}
    };

    return () => {
      ws.close();
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
      // Reset form
      setJobName('');
      setTargetUrl('');
      setExpectedText('');
      setExpectedElement('');
      setExpectedTitle('');
      setExpectedUrl('');
      setExpectedStatus('');
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
        return <span class="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full"><Clock size={12} /> Monitoring</span>;
      case 'success':
        return <span class="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} /> Success (Reserved)</span>;
      case 'failed':
        return <span class="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full"><AlertCircle size={12} /> Failed</span>;
      case 'paused':
      default:
        return <span class="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full"><Pause size={12} /> Paused</span>;
    }
  };

  return (
    <div class="space-y-8 relative">
      
      {/* Page Header */}
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p class="text-sm text-zinc-400">Manage persistent session checkers and browser reserves.</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          class="glass-button px-4 py-2.5 flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} />
          New Monitoring Job
        </button>
      </div>

      {/* Analytics/Summary Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div class="space-y-1">
            <span class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Active Checkers</span>
            <p class="text-2xl font-bold">{jobs.filter(j => j.status === 'active').length}</p>
          </div>
          <Activity class="text-blue-500" size={32} />
        </div>

        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div class="space-y-1">
            <span class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Reserved Sessions</span>
            <p class="text-2xl font-bold">{sessions.filter(s => s.status === 'active').length}</p>
          </div>
          <UserCheck class="text-green-500" size={32} />
        </div>

        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 flex items-center justify-between">
          <div class="space-y-1">
            <span class="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Total Configured Jobs</span>
            <p class="text-2xl font-bold">{jobs.length}</p>
          </div>
          <Clock class="text-zinc-500" size={32} />
        </div>
      </div>

      {/* Main Monitoring Jobs List */}
      <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 overflow-hidden">
        <div class="px-6 py-4 border-b border-zinc-800 bg-zinc-900/20">
          <h2 class="text-lg font-bold text-zinc-100">Monitoring Engines</h2>
        </div>

        {loading ? (
          <div class="flex justify-center items-center py-20">
            <Loader2 class="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div class="text-center py-16 text-zinc-500 text-sm">
            No monitoring jobs configured. Click "New Monitoring Job" to get started.
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase font-semibold bg-zinc-900/10">
                  <th class="px-6 py-3.5">Name</th>
                  <th class="px-6 py-3.5">Target URL</th>
                  <th class="px-6 py-3.5">Interval</th>
                  <th class="px-6 py-3.5">Status</th>
                  <th class="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/60 text-sm">
                {jobs.map((job) => (
                  <tr key={job.id} class="hover:bg-zinc-900/10 transition-colors">
                    <td class="px-6 py-4 font-medium text-zinc-200">{job.name}</td>
                    <td class="px-6 py-4 text-zinc-400 max-w-xs truncate" title={job.target_url}>
                      {job.target_url}
                    </td>
                    <td class="px-6 py-4 text-zinc-400">{job.refresh_interval}s</td>
                    <td class="px-6 py-4">{getStatusBadge(job.status)}</td>
                    <td class="px-6 py-4 text-right flex justify-end gap-2">
                      
                      {/* SETUP BUTTON: Open browser to log in manually before monitoring */}
                      {job.status === 'paused' && (
                        <button
                          onClick={() => {
                            // First trigger starting the container for manual session
                            handleJobAction(job.id, 'start');
                            setActiveJobId(job.id);
                          }}
                          class="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1 transition-all"
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
                          class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                        >
                          {actionLoadingId === job.id ? <Loader2 size={12} class="animate-spin" /> : <Play size={12} />}
                          Monitor
                        </button>
                      ) : job.status === 'active' ? (
                        <button
                          disabled={actionLoadingId === job.id}
                          onClick={() => handleJobAction(job.id, 'pause')}
                          class="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1 transition-all"
                        >
                          <Pause size={12} />
                          Pause
                        </button>
                      ) : null}

                      {/* RECONNECT: If successful match occurs, connect to the browser */}
                      {job.status === 'success' && (
                        <>
                          <button
                            onClick={() => setActiveJobId(job.id)}
                            class="px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-md shadow-green-900/20"
                          >
                            <Eye size={12} />
                            Reconnect
                          </button>
                          <button
                            onClick={() => handleJobAction(job.id, 'stop')}
                            class="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-all border border-zinc-700"
                          >
                            Release
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => handleJobAction(job.id, 'delete')}
                        class="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
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
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Active Session & Screenshot lists */}
        <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4">
          <h3 class="text-base font-bold text-zinc-100">Reserved Sessions & Captures</h3>
          
          {sessions.length === 0 ? (
            <div class="text-center py-10 text-xs text-zinc-500">No session screenshots captured yet.</div>
          ) : (
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sessions.map((session) => (
                <div key={session.id} class="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-2.5">
                  <div class="relative aspect-video bg-zinc-900 rounded-md overflow-hidden border border-zinc-800">
                    {session.screenshot_path ? (
                      <img src={session.screenshot_path} alt="Success Screenshot" class="object-cover w-full h-full hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div class="flex items-center justify-center h-full text-xs text-zinc-600">No Image</div>
                    )}
                  </div>
                  <div class="flex justify-between items-center text-xs">
                    <span class="text-zinc-400 font-semibold truncate max-w-[120px]" title={`Job ID: ${session.job_id}`}>
                      Session #{session.id}
                    </span>
                    <span class="text-[10px] text-zinc-500">
                      {new Date(session.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {session.screenshot_path && (
                    <a
                      href={session.screenshot_path}
                      download
                      target="_blank"
                      rel="noreferrer"
                      class="glass-button-secondary py-1 text-center text-xs font-semibold block rounded"
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
        <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4 overflow-hidden h-[380px]">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Terminal size={16} class="text-blue-500" />
              Activity Console
            </h3>
          </div>

          <div class="flex-1 overflow-y-auto font-mono text-xs text-zinc-400 space-y-2.5 pr-2">
            {logs.length === 0 ? (
              <div class="text-center py-20 text-zinc-600">Console listening for logs...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} class="flex gap-2.5 border-b border-zinc-900/40 pb-1.5 leading-relaxed">
                  <span class="text-zinc-600 shrink-0">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                  <span class={`font-semibold shrink-0 uppercase tracking-wide text-[10px] ${
                    log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span class="text-zinc-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CREATE JOB DIALOG MODAL */}
      {showCreateModal && (
        <div class="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div class="glass-panel w-full max-w-xl p-6 bg-zinc-950/90 border border-zinc-800 overflow-y-auto max-h-[90vh]">
            <h3 class="text-lg font-bold text-zinc-100 mb-4">Configure Monitoring Job</h3>
            
            <form onSubmit={handleCreateJob} class="space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-semibold text-zinc-400">Job Name</label>
                  <input
                    type="text"
                    required
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="My Target Ticket Page"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-semibold text-zinc-400">Target URL</label>
                  <input
                    type="url"
                    required
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://example.com/tickets"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-semibold text-zinc-400">Check Interval (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    required
                    value={interval}
                    onChange={(e) => setIntervalVal(Number(e.target.value))}
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-semibold text-zinc-400">Max Retries</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(Number(e.target.value))}
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-semibold text-zinc-400">Page Timeout (seconds)</label>
                  <input
                    type="number"
                    min="5"
                    required
                    value={timeout}
                    onChange={(e) => setTimeoutVal(Number(e.target.value))}
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <hr class="border-zinc-800" />
              <p class="text-xs font-bold text-zinc-300">Match Criteria (Any checked fields will be evaluated)</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-zinc-400">Expected Text on Page</label>
                  <input
                    type="text"
                    value={expectedText}
                    onChange={(e) => setExpectedText(e.target.value)}
                    placeholder="Available, Buy Now, In Stock"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                
                <div class="flex flex-col gap-1">
                  <label class="text-xs text-zinc-400">Expected Element Selector</label>
                  <input
                    type="text"
                    value={expectedElement}
                    onChange={(e) => setExpectedElement(e.target.value)}
                    placeholder=".purchase-btn-active, #buy-now"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-xs text-zinc-400">Expected Page Title</label>
                  <input
                    type="text"
                    value={expectedTitle}
                    onChange={(e) => setExpectedTitle(e.target.value)}
                    placeholder="Ticket Details | Booking"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-xs text-zinc-400">Expected Success URL</label>
                  <input
                    type="text"
                    value={expectedUrl}
                    onChange={(e) => setExpectedUrl(e.target.value)}
                    placeholder="/booking-confirmed"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>

                <div class="flex flex-col gap-1">
                  <label class="text-xs text-zinc-400">Expected HTTP Status Response</label>
                  <input
                    type="number"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value ? Number(e.target.value) : '')}
                    placeholder="200"
                    class="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div class="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  class="glass-button-secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  class="glass-button px-5 py-2 text-xs flex items-center gap-1.5"
                >
                  {creating && <Loader2 size={12} class="animate-spin" />}
                  Save Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BROWSER INTERACTIVE CDP VIEW PORTAL */}
      {activeJobId !== null && (
        <BrowserViewer
          jobId={activeJobId}
          onClose={() => {
            setActiveJobId(null);
            fetchDashboardData();
          }}
        />
      )}
    </div>
  );
};
