import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { BudgetApiService } from './api/budget-api.service';
import { CategoryResponse, CurrencyResponse } from './api/budget-api.models';
import { AuthService, AuthenticatedUser } from './auth/auth.service';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';
const THEME_STORAGE_KEY = 'budgetbros-theme';

type AuthServiceStub = {
  readonly status: WritableSignal<AuthStatus>;
  readonly isAuthenticated: WritableSignal<boolean>;
  readonly isConfigured: WritableSignal<boolean>;
  readonly errorMessage: WritableSignal<string | null>;
  readonly user: WritableSignal<AuthenticatedUser | null>;
  readonly signOutCallCount: WritableSignal<number>;
  readonly initialize: () => Promise<void>;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => void;
};

function createAuthServiceStub(): AuthServiceStub {
  const signOutCallCount = signal(0);

  return {
    status: signal<AuthStatus>('authenticated'),
    isAuthenticated: signal(true),
    isConfigured: signal(true),
    errorMessage: signal<string | null>(null),
    user: signal<AuthenticatedUser | null>({
      id: 'user-1',
      name: 'Alex Carter',
      email: 'alex@budgetbros.test',
      username: 'alex',
      createdAt: '2024-02-15T18:30:00.000Z'
    }),
    signOutCallCount,
    initialize: async () => Promise.resolve(),
    signIn: async () => Promise.resolve(),
    signOut: () => {
      signOutCallCount.update((count) => count + 1);
    }
  };
}

describe('App', () => {
  let authServiceStub: AuthServiceStub;

  beforeEach(async () => {
    localStorage.clear();
    window.location.hash = '';
    authServiceStub = createAuthServiceStub();
    const budgetApiServiceStub = {
      getCurrentUser: () =>
        of({
          id: 'user-1',
          email: 'alex@budgetbros.test',
          name: 'Alex Carter',
          created_at: '2024-02-15T18:30:00.000Z'
        }),
      listBudgets: () => of([]),
      listCurrencies: () => of<readonly CurrencyResponse[]>([]),
      listCategories: () => of<readonly CategoryResponse[]>([])
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: BudgetApiService, useValue: budgetApiServiceStub }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render dashboard when authenticated', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')?.textContent).toContain('BudgetBros');
    expect(compiled.querySelector('h1')?.textContent).toContain('Budget overview');
    expect(compiled.textContent).toContain('Signed in as');
    expect(compiled.textContent).toContain('User since Feb 2024');
  });

  it('should show the first email character in the avatar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const avatarInitial = compiled.querySelector(
      'details.dropdown-end summary .avatar span'
    ) as HTMLSpanElement | null;

    expect(avatarInitial?.textContent?.trim()).toBe('A');
  });

  it('should show a pending indicator on the transactions navbar link', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const transactionLink = compiled.querySelector(
      'a[href="#transactions"]'
    ) as HTMLAnchorElement | null;
    const indicator = transactionLink?.querySelector(
      'span[aria-hidden="true"]'
    ) as HTMLSpanElement | null;

    expect(transactionLink).not.toBeNull();
    expect(indicator).not.toBeNull();
  });

  it('should show live transaction count in the transactions card', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const transactionsCardText = compiled.querySelector('#transactions p')?.textContent?.trim();

    expect(transactionsCardText).toBe('0 transactions this month');
  });

  it('should show live category count in the budgets card', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const budgetsCardText = compiled.querySelector('#budgets p')?.textContent?.trim();

    expect(budgetsCardText).toBe('0 active categories');
  });

  it('should sign out from the account dropdown', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const signOutButton = compiled.querySelector(
      'details.dropdown-end div.dropdown-content button'
    ) as HTMLButtonElement | null;

    expect(signOutButton?.textContent?.trim()).toBe('Sign out');

    signOutButton?.click();
    fixture.detectChanges();

    expect(authServiceStub.signOutCallCount()).toBe(1);
  });

  it('should close the account dropdown when clicking outside', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const accountDropdown = compiled.querySelector('details.dropdown-end') as HTMLDetailsElement | null;
    expect(accountDropdown).not.toBeNull();
    if (accountDropdown === null) {
      return;
    }

    accountDropdown.open = true;
    document.body.click();
    fixture.detectChanges();

    expect(accountDropdown.open).toBe(false);
  });

  it('should render sign in view when unauthenticated', async () => {
    authServiceStub.status.set('unauthenticated');
    authServiceStub.isAuthenticated.set(false);
    authServiceStub.errorMessage.set('Your session ended, so please sign in again to keep going.');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Sign in to BudgetBros');
    expect(compiled.textContent).toContain('Sign in');
    expect(compiled.textContent).toContain(
      'Your session ended, so please sign in again to keep going.'
    );
    expect(compiled.querySelector('[role="alert"]')?.className).not.toContain('alert-error');
  });

  it('should toggle between dark and light themes from the account dropdown', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const appShell = compiled.querySelector('div[data-theme]');
    expect(appShell?.getAttribute('data-theme')).toBe('budgetbros');

    const accountDropdown = compiled.querySelector('details.dropdown-end') as HTMLDetailsElement | null;
    expect(accountDropdown).not.toBeNull();
    if (accountDropdown !== null) {
      accountDropdown.open = true;
    }

    const themeToggle = accountDropdown?.querySelector(
      'input.theme-controller[value="budgetbros-light"]'
    ) as HTMLInputElement | null;
    expect(themeToggle).not.toBeNull();
    expect(themeToggle?.checked).toBe(false);
    expect(themeToggle?.getAttribute('aria-label')).toBe('Switch to light theme');

    themeToggle?.click();
    fixture.detectChanges();

    expect(appShell?.getAttribute('data-theme')).toBe('budgetbros-light');
    expect(themeToggle?.checked).toBe(true);
    expect(themeToggle?.getAttribute('aria-label')).toBe('Switch to dark theme');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('budgetbros-light');
  });

  it('should initialize the theme from localStorage', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'budgetbros-light');

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const appShell = compiled.querySelector('div[data-theme]');
    const accountDropdown = compiled.querySelector('details.dropdown-end') as HTMLDetailsElement | null;
    const themeToggle = accountDropdown?.querySelector(
      'input.theme-controller[value="budgetbros-light"]'
    ) as HTMLInputElement | null;

    expect(appShell?.getAttribute('data-theme')).toBe('budgetbros-light');
    expect(themeToggle?.checked).toBe(true);
    expect(themeToggle?.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('should show the budgets page when the Budgets button is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const budgetsLink = compiled.querySelector('a[href="#budgets"]') as HTMLAnchorElement | null;

    budgetsLink?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelector('h1')?.textContent).toContain('Budgets');
    expect(compiled.textContent).toContain('No budgets yet');
    expect(compiled.textContent).toContain('Create budget');
  });
});
