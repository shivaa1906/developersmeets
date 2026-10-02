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
  isLoggingOut: boolean;
  login: (token: string, user: AuthSessionUser) => void;
  logout: (redirectUrl?: string | React.MouseEvent | any) => Promise<void>;
  updateUser: (partialUser: Partial<AuthSessionUser>) => void;
  isCEO: boolean;
  isAdmin: boolean;
  isMD: boolean;
  isSupport: boolean;
  isDeveloper: boolean;
  isClient: boolean;
  isExecutive: boolean;
  isPendingVerification: boolean;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<AuthSessionUser | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const router = useRouter();

  // Validate or synchronize session with server
  const syncServerSession = React.useCallback(async (activeToken: string) => {
    try {
      const res = await apiClient.get<{ user: AuthSessionUser }>('/auth/me');
      if (res && res.user) {
        setUser(res.user);
        try {
          localStorage.setItem('nexus_auth_user', JSON.stringify(res.user));
        } catch {}
      }
    } catch (err: any) {
      // If 401 or 403, session is invalid or account status prevents access
      if (err.statusCode === 401 || err.status === 401 || err.statusCode === 403 || err.status === 403) {
        localStorage.removeItem('nexus_auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('nexus_auth_user');
        sessionStorage.clear();
        setToken(null);
        setUser(null);
        realtimeClient.disconnect();

        if (typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/forgot-password') && !path.startsWith('/reset-password')) {
            const errCode = err.code === 'ACCOUNT_SUSPENDED' ? 'account_suspended' : err.code === 'ACCOUNT_DISABLED' ? 'account_disabled' : 'session_expired';
            router.replace(`/login?error=${errCode}`);
          }
        }
      }
    }
  }, [router]);

  React.useEffect(() => {
    try {
      const storedToken = localStorage.getItem('nexus_auth_token');
      const storedUser = localStorage.getItem('nexus_auth_user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        realtimeClient.connect(storedToken);
        // Verify server-side authoritative status in background
        syncServerSession(storedToken);
      }
    } catch (_e) {
      console.warn('Failed to parse local auth session');
    } finally {
      setIsLoading(false);
    }
  }, [syncServerSession]);

  // Reactive listener for 401 / 403 invalidation across tabs or API requests
  React.useEffect(() => {
    const handleInvalidation = (e: any) => {
      localStorage.removeItem('nexus_auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('nexus_auth_user');
      sessionStorage.clear();
      setToken(null);
      setUser(null);
      realtimeClient.disconnect();

      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (!path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/forgot-password') && !path.startsWith('/reset-password')) {
          const detail = e.detail || {};
          const errCode = detail.code === 'ACCOUNT_SUSPENDED' ? 'account_suspended' : detail.code === 'ACCOUNT_DISABLED' ? 'account_disabled' : 'session_expired';
          router.replace(`/login?error=${errCode}`);
        }
      }
    };

    window.addEventListener('nexus:session_invalidated', handleInvalidation);
    window.addEventListener('nexus:account_locked', handleInvalidation);
    return () => {
      window.removeEventListener('nexus:session_invalidated', handleInvalidation);
      window.removeEventListener('nexus:account_locked', handleInvalidation);
    };
  }, [router]);

  const login = (newToken: string, newUser: AuthSessionUser) => {
    localStorage.setItem('nexus_auth_token', newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('nexus_auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    realtimeClient.connect(newToken);
  };

  const logout = async (redirectTarget?: string | React.MouseEvent | unknown) => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    const destination = typeof redirectTarget === 'string' ? redirectTarget : '/login';

    try {
      if (token) {
        await apiClient.post('/auth/logout').catch(() => {});
      }
    } catch (_e) {
    } finally {
      realtimeClient.disconnect();
      localStorage.removeItem('nexus_auth_token');
      localStorage.removeItem('token');
      localStorage.removeItem('nexus_auth_user');
      sessionStorage.clear();

      setToken(null);
      setUser(null);
      setIsLoggingOut(false);
      router.replace(destination);
    }
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
  const isPendingVerification =
    isDeveloper &&
    (user?.verificationStatus === 'PENDING' ||
      user?.verificationStatus === 'PENDING_VERIFICATION' ||
      user?.verificationStatus === 'PENDING_DEVELOPER_APPROVAL');

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isLoggingOut,
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
        isPendingVerification,
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
