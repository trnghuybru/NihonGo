import { Linking } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { apiRequest, ApiError } from './apiClient';
export { ApiError } from './apiClient';

export type Channel = 'email' | 'sms';
export type Provider = 'google' | 'facebook' | 'apple';
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  phone_verified: boolean;
}
export interface Tokens {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface Challenge {
  challenge_id: string;
  channel: Channel;
  destination: string;
  expires_in: number;
  resend_after: number;
}
export interface AuthConfig {
  channels: Channel[];
  providers: Provider[];
  password_min_length: number;
}
export interface SocialProfile {
  status: 'profile_required';
  social_token: string;
  name: string;
  email: string;
}
interface OAuthPending {
  flow_id: string;
  flow_secret: string;
  created_at: number;
}
const SESSION_SERVICE = 'com.nihongoflow.auth.session';
const OAUTH_SERVICE = 'com.nihongoflow.auth.oauth';
let session: Tokens | null = null;
let refreshPromise: Promise<Tokens> | null = null;
let oauthPromise: Promise<
  Tokens | SocialProfile | { status: 'pending' } | null
> | null = null;
const listeners = new Set<(user: User | null) => void>();

async function secureSave(service: string, value: unknown) {
  const result = await Keychain.setGenericPassword(
    'auth',
    JSON.stringify(value),
    {
      service,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
  if (!result) {
    throw new Error('Không lưu được phiên đăng nhập an toàn trên thiết bị.');
  }
}

function request<T>(path: string, data?: unknown, accessToken?: string) {
  return apiRequest<T>(`/auth${path}`, data, accessToken);
}

function notify() {
  listeners.forEach(listener => listener(session?.user ?? null));
}

async function accept(tokens: Tokens): Promise<User> {
  try {
    await secureSave(SESSION_SERVICE, tokens);
  } catch (error) {
    await request('/logout', { refresh_token: tokens.refresh_token }).catch(
      () => undefined,
    );
    throw error;
  }
  session = tokens;
  notify();
  return tokens.user;
}

async function clearSession() {
  await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
  session = null;
  notify();
}

async function refresh(): Promise<Tokens> {
  if (refreshPromise) {
    return refreshPromise;
  }
  if (!session) {
    throw new ApiError('Vui lòng đăng nhập lại.', 401, 'unauthorized');
  }
  const current = session;
  refreshPromise = (async () => {
    try {
      const tokens = await request<Tokens>('/refresh', {
        refresh_token: current.refresh_token,
      });
      await accept(tokens);
      return tokens;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Uses the same secure session and refresh rotation for all protected APIs. */
export async function authenticatedRequest<T>(
  path: string,
  data?: unknown,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = data === undefined
    ? 'GET'
    : 'POST',
  options?: { timeoutMs?: number },
): Promise<T> {
  const currentSession = session;
  if (!currentSession) {
    throw new ApiError('Vui lòng đăng nhập lại.', 401, 'unauthorized');
  }
  try {
    return await apiRequest<T>(
      path,
      data,
      currentSession.access_token,
      method,
      options,
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !session) {
      throw error;
    }
    // Another request may already have refreshed while this one was in flight.
    if (session.user.id !== currentSession.user.id) {
      throw error;
    }
    const tokens =
      session.access_token !== currentSession.access_token
        ? session
        : await refresh();
    return apiRequest<T>(path, data, tokens.access_token, method, options);
  }
}

function authorized<T>(path: string, data?: unknown): Promise<T> {
  return authenticatedRequest<T>(`/auth${path}`, data);
}

export const authService = {
  subscribe(listener: (user: User | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async restore(): Promise<User | null> {
    const saved = await Keychain.getGenericPassword({
      service: SESSION_SERVICE,
    });
    if (!saved) {
      return null;
    }
    try {
      const parsed = JSON.parse(saved.password) as Tokens;
      if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) {
        throw new Error('Invalid session');
      }
      session = parsed;
    } catch {
      await clearSession();
      return null;
    }
    try {
      const result = await authorized<{ user: User }>('/me');
      session = { ...session!, user: result.user };
      notify();
      return result.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        return null;
      }
      throw error;
    }
  },
  config: () => request<AuthConfig>('/config'),
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    social_token?: string;
  }) => request<Challenge>('/register', data),
  async verify(challenge_id: string, code: string) {
    return accept(await request<Tokens>('/verify', { challenge_id, code }));
  },
  async login(identifier: string, password: string) {
    return accept(await request<Tokens>('/login', { identifier, password }));
  },
  resend: (challenge_id: string) =>
    request<Challenge>('/resend', { challenge_id }),
  forgot: (identifier: string) =>
    request<Challenge>('/password/forgot', { identifier }),
  reset: (challenge_id: string, code: string, password: string) =>
    request<{ message: string }>('/password/reset', {
      challenge_id,
      code,
      password,
    }),
  async logout() {
    if (refreshPromise) {
      await refreshPromise.catch(() => undefined);
    }
    if (session) {
      await request('/logout', { refresh_token: session.refresh_token });
    }
    await clearSession();
    await Keychain.resetGenericPassword({ service: OAUTH_SERVICE });
  },
  requestContact: (channel: Channel) =>
    authorized<Challenge>('/contact/request', { channel }),
  async verifyContact(challenge_id: string, code: string) {
    const result = await authorized<{ user: User }>('/contact/verify', {
      challenge_id,
      code,
    });
    if (session) {
      await accept({ ...session, user: result.user });
    }
    return result.user;
  },
  async startSocial(provider: Provider) {
    const result = await request<OAuthPending & { authorization_url: string }>(
      `/oauth/${provider}/start`,
      {},
    );
    await secureSave(OAUTH_SERVICE, {
      flow_id: result.flow_id,
      flow_secret: result.flow_secret,
      created_at: Date.now(),
    });
    await Linking.openURL(result.authorization_url);
  },
  async cancelSocial() {
    await Keychain.resetGenericPassword({ service: OAUTH_SERVICE });
  },
  async resumeSocial() {
    if (oauthPromise) {
      return oauthPromise;
    }
    oauthPromise = (async () => {
      const saved = await Keychain.getGenericPassword({
        service: OAUTH_SERVICE,
      });
      if (!saved) {
        return null;
      }
      const pending = JSON.parse(saved.password) as OAuthPending;
      if (Date.now() - pending.created_at > 600000) {
        await this.cancelSocial();
        throw new Error(
          'Phiên đăng nhập mạng xã hội đã hết hạn. Vui lòng thử lại.',
        );
      }
      try {
        const result = await request<
          Tokens | SocialProfile | { status: 'pending' }
        >('/oauth/exchange', pending);
        if ('status' in result && result.status === 'pending') {
          return result;
        }
        await this.cancelSocial();
        if ('access_token' in result) {
          await accept(result);
        }
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) {
          await this.cancelSocial();
        }
        throw error;
      }
    })().finally(() => {
      oauthPromise = null;
    });
    return oauthPromise;
  },
};
