import { InjectionToken } from '@angular/core';

declare global {
  interface Window {
    BUDGET_API_BASE_URL?: string;
  }
}

const DEFAULT_API_BASE_URL = '/api';

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function readWindowApiBaseUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const configuredUrl = window.BUDGET_API_BASE_URL;
  if (typeof configuredUrl !== 'string' || configuredUrl.trim().length === 0) {
    return null;
  }

  return configuredUrl;
}

function readMetaApiBaseUrl(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const apiBaseUrl = document
    .querySelector<HTMLMetaElement>('meta[name="budget-api-base-url"]')
    ?.content?.trim();
  if (apiBaseUrl === undefined || apiBaseUrl.length === 0) {
    return null;
  }

  return apiBaseUrl;
}

function resolveBudgetApiBaseUrl(): string {
  return normalizeBaseUrl(readWindowApiBaseUrl() ?? readMetaApiBaseUrl() ?? DEFAULT_API_BASE_URL);
}

export const BUDGET_API_BASE_URL = new InjectionToken<string>('BUDGET_API_BASE_URL', {
  providedIn: 'root',
  factory: resolveBudgetApiBaseUrl
});
