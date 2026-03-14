import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthConfig, OAuthErrorEvent, OAuthEvent, OAuthService } from 'angular-oauth2-oidc';
import { COGNITO_CONFIG } from './cognito.config';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

type IdentityClaims = Record<string, unknown>;

export type AuthenticatedUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly username: string | null;
  readonly createdAt: string | null;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly document = inject(DOCUMENT);
  private readonly oauthService = inject(OAuthService);
  private readonly statusState = signal<AuthStatus>('unauthenticated');
  private readonly errorState = signal<string | null>(null);
  private readonly profileClaimsState = signal<IdentityClaims | null>(null);
  private oauthConfigured = false;

  readonly status = computed(() => this.statusState());
  readonly isAuthenticated = computed(() => this.statusState() === 'authenticated');
  readonly isConfigured = computed(() => this.hasRequiredConfig());
  readonly errorMessage = computed(() => this.errorState());
  readonly user = computed<AuthenticatedUser | null>(() => {
    const claims = this.identityClaims();
    return claims === null ? null : this.mapClaimsToUser(claims);
  });

  constructor() {
    this.initializeStorage();
    this.statusState.set(this.initialStatus());

    this.oauthService.events.subscribe((event) => {
      this.handleOAuthEvent(event);
    });
  }

  async initialize(): Promise<void> {
    this.errorState.set(null);

    if (!this.hasRequiredConfig()) {
      this.setUnauthenticatedState();
      return;
    }

    this.configureOAuthClient();
    this.statusState.set('checking');

    try {
      await this.oauthService.tryLoginCodeFlow();

      if (!this.oauthService.hasValidAccessToken() && this.hasRefreshToken()) {
        await this.oauthService.refreshToken();
      }

      if (!this.oauthService.hasValidAccessToken()) {
        this.setUnauthenticatedState();
        return;
      }

      await this.setAuthenticatedState();
    } catch (error) {
      this.oauthService.logOut(true);
      this.setUnauthenticatedState();
      this.errorState.set(this.mapAuthErrorToMessage(error));
    }
  }

  async signIn(): Promise<void> {
    if (!this.hasRequiredConfig()) {
      this.errorState.set('Sign-in is not configured yet.');
      return;
    }

    this.errorState.set(null);
    this.configureOAuthClient();
    this.oauthService.initCodeFlow();
  }

  signOut(): void {
    this.errorState.set(null);
    this.setUnauthenticatedState();

    if (!this.hasRequiredConfig()) {
      this.oauthService.logOut(true);
      return;
    }

    this.configureOAuthClient();
    this.oauthService.logOut({
      client_id: COGNITO_CONFIG.clientId,
      logout_uri: COGNITO_CONFIG.logoutUri
    });
  }

  private initializeStorage(): void {
    const storage = this.localStorage();
    if (storage !== null) {
      this.oauthService.setStorage(storage);
    }
  }

  private handleOAuthEvent(event: OAuthEvent): void {
    if (event.type === 'logout' || event.type === 'token_refresh_error') {
      this.setUnauthenticatedState();
    }

    if (event.type === 'token_refresh_error') {
      this.errorState.set('Your session ended. Please sign in again to continue.');
    }

    if (event instanceof OAuthErrorEvent && event.type === 'token_error') {
      const details = this.extractProviderError(event.params);
      if (details !== null) {
        this.errorState.set(details);
      }
    }
  }

  private setUnauthenticatedState(): void {
    this.statusState.set('unauthenticated');
    this.profileClaimsState.set(null);
  }

  private async setAuthenticatedState(): Promise<void> {
    await this.loadUserProfileClaims();
    this.statusState.set('authenticated');
    this.errorState.set(null);
  }

  private async loadUserProfileClaims(): Promise<void> {
    try {
      const userProfile = await this.oauthService.loadUserProfile();
      const claims = extractClaimsObject(userProfile);
      this.profileClaimsState.set(claims);
      return;
    } catch {
      // Ignore profile fetch failures and fallback to existing identity claims.
    }

    this.profileClaimsState.set(this.oauthIdentityClaims());
  }

  private configureOAuthClient(): void {
    if (this.oauthConfigured) {
      return;
    }

    this.oauthService.configure(this.authConfig());
    this.oauthService.setupAutomaticSilentRefresh();
    this.oauthConfigured = true;
  }

  private authConfig(): AuthConfig {
    const domain = this.cognitoDomain();

    return {
      clientId: COGNITO_CONFIG.clientId,
      redirectUri: COGNITO_CONFIG.redirectUri,
      responseType: 'code',
      scope: this.normalizedScopes().join(' '),
      oidc: false,
      requestAccessToken: true,
      loginUrl: new URL('/oauth2/authorize', domain).toString(),
      tokenEndpoint: new URL('/oauth2/token', domain).toString(),
      userinfoEndpoint: new URL('/oauth2/userInfo', domain).toString(),
      revocationEndpoint: new URL('/oauth2/revoke', domain).toString(),
      logoutUrl: new URL('/logout', domain).toString(),
      postLogoutRedirectUri: '',
      redirectUriAsPostLogoutRedirectUriFallback: false,
      strictDiscoveryDocumentValidation: false,
      showDebugInformation: false
    };
  }

  private identityClaims(): IdentityClaims | null {
    return this.profileClaimsState() ?? this.oauthIdentityClaims();
  }

  private oauthIdentityClaims(): IdentityClaims | null {
    return normalizeClaims(this.oauthService.getIdentityClaims());
  }

  private hasRefreshToken(): boolean {
    const refreshToken = this.oauthService.getRefreshToken();
    return refreshToken !== null && refreshToken.trim().length > 0;
  }

  private initialStatus(): AuthStatus {
    if (!this.hasRequiredConfig()) {
      return 'unauthenticated';
    }

    if (this.oauthService.hasValidAccessToken()) {
      return 'authenticated';
    }

    return this.hasRefreshToken() ? 'checking' : 'unauthenticated';
  }

  private mapClaimsToUser(claims: IdentityClaims): AuthenticatedUser {
    const email = this.readClaimAsString(claims, 'email');
    const username = this.readFirstClaimAsString(claims, [
      'cognito:username',
      'username',
      'preferred_username'
    ]);
    const createdAt = this.readFirstClaimAsDateString(claims, [
      'created_at',
      'createdAt',
      'user_create_date',
      'userCreateDate',
      'UserCreateDate'
    ]);
    const fallbackName = email ?? username ?? 'Budget User';
    const name = this.readClaimAsString(claims, 'name') ?? fallbackName;
    const id = this.readClaimAsString(claims, 'sub') ?? username ?? fallbackName;

    return { id, name, email, username, createdAt };
  }

  private readFirstClaimAsString(claims: IdentityClaims, keys: readonly string[]): string | null {
    for (const key of keys) {
      const value = this.readClaimAsString(claims, key);
      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private readClaimAsString(claims: IdentityClaims, claim: string): string | null {
    const value = claims[claim];
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private readFirstClaimAsDateString(claims: IdentityClaims, keys: readonly string[]): string | null {
    for (const key of keys) {
      const value = claims[key];
      const normalized = this.normalizeDateClaim(value);
      if (normalized !== null) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeDateClaim(value: unknown): string | null {
    if (typeof value === 'number') {
      return this.parseEpochToIsoString(value);
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return this.parseEpochToIsoString(numeric);
    }

    const timestamp = Date.parse(normalized);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    return new Date(timestamp).toISOString();
  }

  private parseEpochToIsoString(value: number): string | null {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const parsedDate = new Date(millis);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  private mapAuthErrorToMessage(error: unknown): string {
    if (error instanceof OAuthErrorEvent) {
      const providerError = this.extractProviderError(error.params);
      if (providerError !== null) {
        return providerError;
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Sign in failed. Please try again.';
  }

  private extractProviderError(params: unknown): string | null {
    if (!isRecord(params)) {
      return null;
    }

    const description = this.readRecordString(params, 'error_description');
    if (description !== null) {
      return description;
    }

    const code = this.readRecordString(params, 'error');
    if (code !== null) {
      return `Authentication failed (${code}).`;
    }

    return null;
  }

  private readRecordString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizedScopes(): readonly string[] {
    return COGNITO_CONFIG.scopes
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  }

  private cognitoDomain(): string {
    return COGNITO_CONFIG.domain.trim().replace(/\/+$/, '');
  }

  private hasRequiredConfig(): boolean {
    return (
      this.isAbsoluteUrl(COGNITO_CONFIG.domain) &&
      COGNITO_CONFIG.clientId.trim().length > 0 &&
      this.isAbsoluteUrl(COGNITO_CONFIG.redirectUri) &&
      this.isAbsoluteUrl(COGNITO_CONFIG.logoutUri) &&
      this.normalizedScopes().length > 0
    );
  }

  private isAbsoluteUrl(candidate: string): boolean {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }

  private localStorage(): Storage | null {
    try {
      return this.document.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }
}

function normalizeClaims(value: unknown): IdentityClaims | null {
  if (!isRecord(value)) {
    return null;
  }

  return value;
}

function extractClaimsObject(value: unknown): IdentityClaims | null {
  if (!isRecord(value)) {
    return null;
  }

  const claimsContainer = value['info'];
  return normalizeClaims(claimsContainer) ?? value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
