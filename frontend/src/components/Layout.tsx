import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { 
  LayoutDashboard, 
  Settings, 
  ShieldAlert, 
  Menu, 
  X, 
  Globe 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Notification Settings', href: '/settings', icon: Settings },
  ];

  if (user?.role === 'admin') {
    navigation.push({ name: 'Admin Control', href: '/admin', icon: ShieldAlert });
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#08080a] text-zinc-100">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden flex justify-between items-center p-4 bg-zinc-900/60 border-b border-zinc-800 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
            Session Reserve
          </span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-zinc-400 hover:text-white">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 transform md:relative md:translate-x-0 w-64 glass-panel border-r border-zinc-800/80 bg-zinc-950/80 p-5 flex flex-col justify-between transition-transform duration-300 ease-in-out z-50
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:flex'}
      `}>
        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <Link to="/" className="flex items-center gap-2 text-2xl font-extrabold bg-gradient-to-r from-blue-400 via-indigo-500 to-indigo-600 bg-clip-text text-transparent">
              <Globe className="text-blue-500 animate-pulse" size={26} />
              <span>SessionRsv</span>
            </Link>
            <button className="md:hidden text-zinc-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
                    ${isActive(item.href) 
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                      : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'}
                  `}
                >
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-800/60 pt-4">
          <div className="px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-zinc-300">System Ready</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Admin
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
};
