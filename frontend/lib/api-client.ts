const API_BASE_URL = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api');

class ApiClient {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('nexus_auth_token');
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || `HTTP error ${response.status}`;
      const err: any = new Error(errorMsg);
      err.status = response.status;
      err.statusCode = response.status;
      err.code = data.code;
      err.data = data;

      // When an authenticated request fails with 401 or account suspension/disabling (403),
      // broadcast event for proactive session cleanup, avoiding login/register endpoints
      if (
        typeof window !== 'undefined' &&
        token &&
        !endpoint.includes('/auth/login') &&
        !endpoint.includes('/auth/register')
      ) {
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent('nexus:session_invalidated', { detail: { code: data.code || 'SESSION_EXPIRED', error: errorMsg } }));
        } else if (response.status === 403 && (data.code === 'ACCOUNT_SUSPENDED' || data.code === 'ACCOUNT_DISABLED')) {
          window.dispatchEvent(new CustomEvent('nexus:account_locked', { detail: { code: data.code, error: errorMsg } }));
        }
      }

      throw err;
    }

    return data as T;
  }

  get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export const api = apiClient;
