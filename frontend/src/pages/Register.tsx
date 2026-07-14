import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { KeyRound, Mail, Loader2, Globe } from 'lucide-react';

export const Register: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="min-h-screen flex items-center justify-center bg-[#070709] p-4 relative overflow-hidden">
      
      {/* Background Gradients */}
      <div class="absolute w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-[120px] -top-40 -left-40 pointer-events-none" />
      <div class="absolute w-[400px] h-[400px] rounded-full bg-indigo-600/10 blur-[100px] -bottom-40 -right-40 pointer-events-none" />

      <div class="glass-panel w-full max-w-md p-8 flex flex-col gap-6 bg-zinc-950/60 border border-zinc-800/80">
        <div class="flex flex-col items-center gap-2">
          <div class="flex items-center gap-2 text-2xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-1">
            <Globe class="text-blue-500" size={28} />
            <span>Session Reserve</span>
          </div>
          <h2 class="text-xl font-semibold text-zinc-100">Create your Account</h2>
          <p class="text-xs text-zinc-400">Launch authenticated browsers and monitor sites</p>
        </div>

        {error && (
          <div class="p-3 text-xs bg-red-950/30 border border-red-900/40 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-zinc-400">Email Address</label>
            <div class="relative">
              <Mail class="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                class="glass-input w-full pl-10 pr-4 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-zinc-400">Password</label>
            <div class="relative">
              <KeyRound class="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                class="glass-input w-full pl-10 pr-4 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-zinc-400">Confirm Password</label>
            <div class="relative">
              <KeyRound class="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                class="glass-input w-full pl-10 pr-4 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            class="glass-button w-full py-2.5 flex items-center justify-center gap-2 text-sm mt-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} class="animate-spin" /> : null}
            Sign Up
          </button>
        </form>

        <div class="text-center text-xs text-zinc-500">
          Already have an account?{' '}
          <Link to="/login" class="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
