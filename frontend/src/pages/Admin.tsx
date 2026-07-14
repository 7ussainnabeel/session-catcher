import React, { useEffect, useState } from 'react';
import { apiFetch, User, WorkerInfo, AuditLog, SystemStats } from '../utils/api';
import { 
  ShieldAlert, 
  Users, 
  Cpu, 
  Terminal, 
  Loader2, 
  Ban, 
  UserCheck, 
  Trash2,
  Database,
  Radio,
  Server
} from 'lucide-react';

export const Admin: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUserId, setActionUserId] = useState<number | null>(null);

  const fetchAdminData = async () => {
    try {
      const statsData = await apiFetch('/admin/stats');
      const usersData = await apiFetch('/admin/users');
      const workersData = await apiFetch('/admin/workers');
      const logsData = await apiFetch('/admin/logs');
      setStats(statsData);
      setUsers(usersData || []);
      setWorkers(workersData || []);
      setLogs(logsData || []);
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    // Poll stats and workers every 8 seconds
    const interval = setInterval(fetchAdminData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleSuspend = async (userId: number, currentStatus: boolean) => {
    setActionUserId(userId);
    try {
      await apiFetch(`/admin/users/${userId}/status?suspend=${!currentStatus}`, {
        method: 'PUT',
      });
      await fetchAdminData();
    } catch (err) {
      alert('Failed to update user status');
    } finally {
      setActionUserId(null);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (confirm('Are you sure you want to permanently delete this user? All their browser profiles and jobs will be deleted.')) {
      setActionUserId(userId);
      try {
        await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });
        await fetchAdminData();
      } catch (err) {
        alert('Failed to delete user');
      } finally {
        setActionUserId(null);
      }
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center py-40">
        <Loader2 class="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div class="space-y-8">
      {/* Header */}
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <ShieldAlert class="text-red-500 animate-pulse" size={32} />
          Admin Control Center
        </h1>
        <p class="text-sm text-zinc-400">Monitor host services, workers, active processes, and user accounts.</p>
      </div>

      {/* System Metrics Panel */}
      {stats && (
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <Cpu size={16} class="text-blue-500" /> Host CPU Usage
              </span>
              <span class="text-sm font-bold text-blue-400">{stats.system.cpu}%</span>
            </div>
            <div class="w-full bg-zinc-800 rounded-full h-2">
              <div class="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.system.cpu}%` }}></div>
            </div>
          </div>

          <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <Server size={16} class="text-green-500" /> Host RAM Usage
              </span>
              <span class="text-sm font-bold text-green-400">{stats.system.ram}%</span>
            </div>
            <div class="w-full bg-zinc-800 rounded-full h-2">
              <div class="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.system.ram}%` }}></div>
            </div>
          </div>

          <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                <Database size={16} class="text-teal-500" /> Host Disk Usage
              </span>
              <span class="text-sm font-bold text-teal-400">{stats.system.disk}%</span>
            </div>
            <div class="w-full bg-zinc-800 rounded-full h-2">
              <div class="bg-teal-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.system.disk}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Main grids */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* User Account Controls */}
        <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4">
          <h3 class="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Users size={18} class="text-blue-500" />
            User Management
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase font-semibold">
                  <th class="py-2.5">Email</th>
                  <th class="py-2.5">Role</th>
                  <th class="py-2.5">Status</th>
                  <th class="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/60 text-xs">
                {users.map((u) => (
                  <tr key={u.id} class="hover:bg-zinc-900/10 transition-colors">
                    <td class="py-3 font-medium text-zinc-300 truncate max-w-[150px]" title={u.email}>{u.email}</td>
                    <td class="py-3 uppercase text-zinc-400">{u.role}</td>
                    <td class="py-3">
                      <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.is_suspended ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                        {u.is_suspended ? 'Suspended' : 'Active'}
                      </span>
                    </td>
                    <td class="py-3 text-right flex justify-end gap-2">
                      {u.role !== 'admin' && (
                        <>
                          <button
                            disabled={actionUserId === u.id}
                            onClick={() => handleToggleSuspend(u.id, u.is_suspended)}
                            class={`p-1.5 rounded border ${u.is_suspended ? 'border-green-500/20 text-green-400 hover:bg-green-500/10' : 'border-red-500/20 text-red-400 hover:bg-red-500/10'} transition-all`}
                            title={u.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                          >
                            {u.is_suspended ? <UserCheck size={12} /> : <Ban size={12} />}
                          </button>
                          <button
                            disabled={actionUserId === u.id}
                            onClick={() => handleDeleteUser(u.id)}
                            class="p-1.5 rounded border border-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
                            title="Delete User"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Worker Pool Info */}
        <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4">
          <h3 class="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Radio size={18} class="text-green-500" />
            Worker Pool & Running Browsers
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase font-semibold">
                  <th class="py-2.5">Worker Name</th>
                  <th class="py-2.5">Status</th>
                  <th class="py-2.5">CDP Target Port</th>
                  <th class="py-2.5 text-right">Last Ping</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/60 text-xs">
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={4} class="py-4 text-center text-zinc-600">No workers registered in database. Ensure celery is running.</td>
                  </tr>
                ) : (
                  workers.map((w) => (
                    <tr key={w.id} class="hover:bg-zinc-900/10 transition-colors">
                      <td class="py-3 font-semibold text-zinc-300">{w.name}</td>
                      <td class="py-3">
                        <span class={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          w.status === 'monitoring' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse' :
                          w.status === 'reserved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                          'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td class="py-3 font-mono text-zinc-400">{w.port || 'None'}</td>
                      <td class="py-3 text-right text-zinc-500">{new Date(w.last_ping).toLocaleTimeString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Global Activity Log */}
      <div class="glass-panel bg-zinc-950/30 border border-zinc-800/80 p-6 flex flex-col gap-4">
        <h3 class="text-base font-bold text-zinc-100 flex items-center gap-2">
          <Terminal size={16} class="text-red-500" />
          Global Activity Audit Log
        </h3>

        <div class="overflow-y-auto max-h-[300px] font-mono text-xs text-zinc-400 space-y-2 pr-2">
          {logs.map((log) => (
            <div key={log.id} class="flex gap-2 border-b border-zinc-900/40 pb-1.5">
              <span class="text-zinc-600">{new Date(log.created_at).toLocaleString()}</span>
              <span class={`font-bold uppercase tracking-wide text-[10px] ${
                log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-blue-400'
              }`}>
                [{log.level}]
              </span>
              <span class="text-zinc-300">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
