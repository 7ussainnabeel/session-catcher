import React, { useEffect, useState } from 'react';
import { apiFetch, NotificationSettings } from '../utils/api';
import { Loader2, Mail, Send, Sliders, Webhook, Check, Slack } from 'lucide-react';

export const Settings: React.FC = () => {
  const [_settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form states
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState('');
  
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Telegram test states
  const [testingTg, setTestingTg] = useState(false);
  const [tgFeedback, setTgFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleTestTelegram = async () => {
    setTestingTg(true);
    setTgFeedback(null);
    try {
      await apiFetch('/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify({
          email_enabled: emailEnabled,
          email_address: emailAddress || null,
          telegram_enabled: tgEnabled,
          telegram_bot_token: tgToken || null,
          telegram_chat_id: tgChatId || null,
          discord_enabled: discordEnabled,
          discord_webhook_url: discordWebhook || null,
          slack_enabled: slackEnabled,
          slack_webhook_url: slackWebhook || null,
          webhook_enabled: webhookEnabled,
          webhook_url: webhookUrl || null,
        }),
      });

      const res = await apiFetch('/notifications/test-telegram', { method: 'POST' });
      setTgFeedback({ type: 'success', message: res.message || 'Test alert delivered to Telegram!' });
    } catch (err: any) {
      setTgFeedback({ type: 'error', message: err.message || 'Failed to send test message' });
    } finally {
      setTestingTg(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiFetch('/notifications/settings');
      if (data) {
        setSettings(data);
        setEmailEnabled(data.email_enabled);
        setEmailAddress(data.email_address || '');
        setTgEnabled(data.telegram_enabled);
        setTgToken(data.telegram_bot_token || '');
        setTgChatId(data.telegram_chat_id || '');
        setDiscordEnabled(data.discord_enabled);
        setDiscordWebhook(data.discord_webhook_url || '');
        setSlackEnabled(data.slack_enabled);
        setSlackWebhook(data.slack_webhook_url || '');
        setWebhookEnabled(data.webhook_enabled);
        setWebhookUrl(data.webhook_url || '');
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await apiFetch('/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify({
          email_enabled: emailEnabled,
          email_address: emailAddress || null,
          telegram_enabled: tgEnabled,
          telegram_bot_token: tgToken || null,
          telegram_chat_id: tgChatId || null,
          discord_enabled: discordEnabled,
          discord_webhook_url: discordWebhook || null,
          slack_enabled: slackEnabled,
          slack_webhook_url: slackWebhook || null,
          webhook_enabled: webhookEnabled,
          webhook_url: webhookUrl || null,
        }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-40">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Notification Settings</h1>
        <p className="text-sm text-zinc-400">Configure alert channels to trigger on page match success.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email Alerts */}
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="text-blue-500" size={22} />
              <div>
                <h3 className="font-bold text-zinc-200">Email Notifications</h3>
                <p className="text-xs text-zinc-500">Receive alerts inside your inbox.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={emailEnabled} 
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {emailEnabled && (
            <div className="flex flex-col gap-1.5 pt-2">
              <label className="text-xs font-semibold text-zinc-400">Recipient Email Address</label>
              <input
                type="email"
                required
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="alerts@domain.com"
                className="glass-input max-w-md px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Telegram Alerts */}
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Send className="text-blue-400" size={22} />
              <div>
                <h3 className="font-bold text-zinc-200">Telegram Bot Notifications</h3>
                <p className="text-xs text-zinc-500">Deliver messages to a personal Telegram chat or channel.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={tgEnabled} 
                onChange={(e) => setTgEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {tgEnabled && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400">Bot Token</label>
                  <input
                    type="password"
                    required
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:ABCdefGhI..."
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400">Chat ID</label>
                  <input
                    type="text"
                    required
                    value={tgChatId}
                    onChange={(e) => setTgChatId(e.target.value)}
                    placeholder="987654321"
                    className="glass-input px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={testingTg || !tgToken || !tgChatId}
                  onClick={handleTestTelegram}
                  className="px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  {testingTg ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Test Telegram Chatbot
                </button>

                {tgFeedback && (
                  <span className={`text-xs font-medium ${tgFeedback.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {tgFeedback.message}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Discord Alerts */}
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sliders className="text-indigo-400" size={22} />
              <div>
                <h3 className="font-bold text-zinc-200">Discord Webhooks</h3>
                <p className="text-xs text-zinc-500">Post success notification payloads into a Discord channel.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={discordEnabled} 
                onChange={(e) => setDiscordEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {discordEnabled && (
            <div className="flex flex-col gap-1.5 pt-2">
              <label className="text-xs font-semibold text-zinc-400">Webhook URL</label>
              <input
                type="url"
                required
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Slack Alerts */}
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Slack className="text-orange-400" size={22} />
              <div>
                <h3 className="font-bold text-zinc-200">Slack Integration</h3>
                <p className="text-xs text-zinc-500">Post notifications into a dedicated Slack channel.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={slackEnabled} 
                onChange={(e) => setSlackEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {slackEnabled && (
            <div className="flex flex-col gap-1.5 pt-2">
              <label className="text-xs font-semibold text-zinc-400">Incoming Webhook URL</label>
              <input
                type="url"
                required
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Generic Webhooks */}
        <div className="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Webhook className="text-teal-400" size={22} />
              <div>
                <h3 className="font-bold text-zinc-200">Generic API Webhooks</h3>
                <p className="text-xs text-zinc-500">Trigger external scripts or workflows on status match events.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={webhookEnabled} 
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {webhookEnabled && (
            <div className="flex flex-col gap-1.5 pt-2">
              <label className="text-xs font-semibold text-zinc-400">Endpoint Webhook URL</label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.mycompany.com/v1/trigger-hook"
                className="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Save Bar */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="glass-button px-6 py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Save Settings
          </button>

          {success && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-fade-in">
              <Check size={14} />
              Configuration updated successfully!
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
