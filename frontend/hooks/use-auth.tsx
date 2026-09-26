'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { UserRole } from '@/types';

export interface AuthSessionUser {
  id?: string;
  userId?: string;
  email: string;
  role: UserRole;
  status?: string;
  name?: string;
  developerId?: string;
  clientId?: string;
  clientNumber?: string;
  verificationStatus?: string;
}

interface AuthContextType {
  user: AuthSessionUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthSessionUser) => void;
  logout: () => void;
  isCEO: boolean;
  isAdmin: boolean;
  isMD: boolean;
  isDeveloper: boolean;
  isClient: boolean;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<AuthSessionUser | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    try {
      const storedToken = localStorage.getItem('nexus_auth_token');
      const storedUser = localStorage.getItem('nexus_auth_user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (_e) {
      console.warn('Failed to parse local auth session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: AuthSessionUser) => {
    localStorage.setItem('nexus_auth_token', newToken);
    localStorage.setItem('nexus_auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('nexus_auth_token');
    localStorage.removeItem('nexus_auth_user');
    setToken(null);
    setUser(null);
    router.push('/login');
  };

  const isCEO = user?.role === 'CEO';
  const isAdmin = user?.role === 'ADMIN' || isCEO;
  const isMD = user?.role === 'MD' || isCEO;
  const isDeveloper = user?.role === 'DEVELOPER';
  const isClient = user?.role === 'CLIENT';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isCEO,
        isAdmin,
        isMD,
        isDeveloper,
        isClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
