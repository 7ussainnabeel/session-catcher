import React, { useEffect, useState } from 'react';
import { apiFetch, NotificationSettings } from '../utils/api';
import { Loader2, Mail, Send, Sliders, Webhook, Check, Slack, HelpCircle } from 'lucide-react';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
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
      <div class="flex justify-center items-center py-40">
        <Loader2 class="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight">Notification Settings</h1>
        <p class="text-sm text-zinc-400">Configure alert channels to trigger on page match success.</p>
      </div>

      <form onSubmit={handleSave} class="space-y-6">
        {/* Email Alerts */}
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Mail class="text-blue-500" size={22} />
              <div>
                <h3 class="font-bold text-zinc-200">Email Notifications</h3>
                <p class="text-xs text-zinc-500">Receive alerts inside your inbox.</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={emailEnabled} 
                onChange={(e) => setEmailEnabled(e.target.checked)}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {emailEnabled && (
            <div class="flex flex-col gap-1.5 pt-2">
              <label class="text-xs font-semibold text-zinc-400">Recipient Email Address</label>
              <input
                type="email"
                required
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="alerts@domain.com"
                class="glass-input max-w-md px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Telegram Alerts */}
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Send class="text-blue-400" size={22} />
              <div>
                <h3 class="font-bold text-zinc-200">Telegram Bot Notifications</h3>
                <p class="text-xs text-zinc-500">Deliver messages to a personal Telegram chat or channel.</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={tgEnabled} 
                onChange={(e) => setTgEnabled(e.target.checked)}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {tgEnabled && (
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-zinc-400">Bot Token</label>
                <input
                  type="password"
                  required
                  value={tgToken}
                  onChange={(e) => setTgToken(e.target.value)}
                  placeholder="123456789:ABCdefGhI..."
                  class="glass-input px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-semibold text-zinc-400">Chat ID</label>
                <input
                  type="text"
                  required
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="987654321"
                  class="glass-input px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Discord Alerts */}
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Sliders class="text-indigo-400" size={22} />
              <div>
                <h3 class="font-bold text-zinc-200">Discord Webhooks</h3>
                <p class="text-xs text-zinc-500">Post success notification payloads into a Discord channel.</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={discordEnabled} 
                onChange={(e) => setDiscordEnabled(e.target.checked)}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {discordEnabled && (
            <div class="flex flex-col gap-1.5 pt-2">
              <label class="text-xs font-semibold text-zinc-400">Webhook URL</label>
              <input
                type="url"
                required
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                class="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Slack Alerts */}
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Slack class="text-orange-400" size={22} />
              <div>
                <h3 class="font-bold text-zinc-200">Slack Integration</h3>
                <p class="text-xs text-zinc-500">Post notifications into a dedicated Slack channel.</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={slackEnabled} 
                onChange={(e) => setSlackEnabled(e.target.checked)}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {slackEnabled && (
            <div class="flex flex-col gap-1.5 pt-2">
              <label class="text-xs font-semibold text-zinc-400">Incoming Webhook URL</label>
              <input
                type="url"
                required
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                class="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Generic Webhooks */}
        <div class="glass-panel p-6 bg-zinc-950/40 border border-zinc-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Webhook class="text-teal-400" size={22} />
              <div>
                <h3 class="font-bold text-zinc-200">Generic API Webhooks</h3>
                <p class="text-xs text-zinc-500">Trigger external scripts or workflows on status match events.</p>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={webhookEnabled} 
                onChange={(e) => setWebhookEnabled(e.target.checked)}
                class="sr-only peer" 
              />
              <div class="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          {webhookEnabled && (
            <div class="flex flex-col gap-1.5 pt-2">
              <label class="text-xs font-semibold text-zinc-400">Endpoint Webhook URL</label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.mycompany.com/v1/trigger-hook"
                class="glass-input max-w-2xl px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Save Bar */}
        <div class="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            class="glass-button px-6 py-2.5 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} class="animate-spin" /> : null}
            Save Settings
          </button>

          {success && (
            <div class="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-fade-in">
              <Check size={14} />
              Configuration updated successfully!
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
