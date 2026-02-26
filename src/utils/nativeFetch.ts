// src/utils/nativeFetch.ts
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

type Json = Record<string, any>;

export async function httpJson<T = any>(
  url: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers = opts.headers ?? {};

  // Native: bypass CORS via CapacitorHttp
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers,
      data: opts.body ?? undefined,
    });

    if (res.status < 200 || res.status >= 300) {
      // include response data for debugging
      throw new Error(`HTTP ${res.status} ${method} ${url} :: ${JSON.stringify(res.data ?? {})}`);
    }
    return res.data as T;
  }

  // Web: regular fetch
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${method} ${url} :: ${text}`);
  }

  return (await res.json()) as T;
}
