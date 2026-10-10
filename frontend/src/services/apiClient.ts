import { apiBaseUrl } from '../config/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  data?: unknown,
  accessToken?: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = data === undefined
    ? 'GET'
    : 'POST',
  options?: { timeoutMs?: number },
): Promise<T> {
  const baseUrl = apiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? 20000,
  );
  try {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      throw new ApiError(
        result?.error || 'Không thực hiện được yêu cầu.',
        response.status,
        result?.code || 'request_failed',
        result?.retry_after || 0,
      );
    }
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(
      'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
