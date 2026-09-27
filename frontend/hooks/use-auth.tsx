'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { realtimeClient } from '@/lib/realtime-client';
import { UserRole } from '@/types';

export interface AuthSessionUser {
  id?: string;
  userId?: string;
  uid?: string;
  publicUid?: string;
  email: string;
  role: UserRole;
  status?: string;
  emailVerified?: boolean;
  isSuspended?: boolean;
  lastLoginAt?: string;
  name?: string;
  developerId?: string;
  clientId?: string;
  clientNumber?: string;
  supportStaffId?: string;
  verificationStatus?: string;
  profileImage?: string;
  avatarUrl?: string;
  permissions?: string[];
}

interface AuthContextType {
  user: AuthSessionUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthSessionUser) => void;
  logout: () => void;
  updateUser: (partialUser: Partial<AuthSessionUser>) => void;
  isCEO: boolean;
  isAdmin: boolean;
  isMD: boolean;
  isSupport: boolean;
  isDeveloper: boolean;
  isClient: boolean;
  isExecutive: boolean;
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
        // Connect realtime socket
        realtimeClient.connect(storedToken);
      }
    } catch (_e) {
      console.warn('Failed to parse local auth session');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: AuthSessionUser) => {
    localStorage.setItem('nexus_auth_token', newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('nexus_auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    // Connect realtime transport
    realtimeClient.connect(newToken);
  };

  const logout = () => {
    try {
      // Notify backend if token exists
      if (token) {
        apiClient.post('/auth/logout').catch(() => {});
      }
    } catch (_e) {}

    // Disconnect websocket
    realtimeClient.disconnect();

    // Destroy local session storage
    localStorage.removeItem('nexus_auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('nexus_auth_user');
    sessionStorage.clear();

    setToken(null);
    setUser(null);

    // Redirect to login using replace to prevent back-navigation cache
    router.replace('/login');
  };

  const updateUser = (partialUser: Partial<AuthSessionUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...partialUser };
      try {
        localStorage.setItem('nexus_auth_user', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const isCEO = user?.role === 'CEO';
  const isAdmin = user?.role === 'ADMIN';
  const isMD = user?.role === 'MD';
  const isSupport = user?.role === 'SUPPORT';
  const isDeveloper = user?.role === 'DEVELOPER';
  const isClient = user?.role === 'CLIENT';
  const isExecutive = isCEO || isMD || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        updateUser,
        isCEO,
        isAdmin,
        isMD,
        isSupport,
        isDeveloper,
        isClient,
        isExecutive,
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
