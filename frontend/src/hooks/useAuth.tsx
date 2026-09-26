import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, User } from '../utils/api';

const DEFAULT_USER: User = {
  id: 1,
  email: 'hnabeel3@gmail.com',
  role: 'admin',
  is_suspended: false,
  created_at: new Date().toISOString()
};

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshUser = async () => {
    try {
      const data = await apiFetch('/auth/me');
      if (data && data.email) {
        setUser(data);
      } else {
        setUser(DEFAULT_USER);
      }
    } catch {
      setUser(DEFAULT_USER);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async () => {};
  const register = async () => {};
  const logout = () => {};

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
