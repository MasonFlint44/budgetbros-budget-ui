import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BudgetApiService } from './api/budget-api.service';
import {
  BudgetResponse,
  TransactionLineResponse,
  TransactionResponse,
  UserResponse
} from './api/budget-api.models';
import { AuthService } from './auth/auth.service';
import { BudgetsPageComponent } from './budgets/budgets-page.component';
import { TransactionsPageComponent } from './transactions/transactions-page.component';
import { MoneyCountdownRowComponent } from './money-countdown-row.component';

type AppPage = 'dashboard' | 'budgets' | 'transactions' | 'goals' | 'reports';

type NavLink = {
  readonly label: string;
  readonly href: string;
  readonly page: AppPage;
  readonly hasPendingTransactions: boolean;
};

type BudgetActivityRow = {
  readonly id: string;
  readonly label: string;
  readonly currencyCode: string;
  readonly monthlyInflowInCents: number;
  readonly monthlyOutflowInCents: number;
  readonly monthlyNetInCents: number;
  readonly transactionCount: number;
};

type BudgetActivitySnapshot = {
  readonly row: BudgetActivityRow;
  readonly categoryCount: number;
};

type AppTheme = 'budgetbros' | 'budgetbros-light';

type PeriodRange = {
  readonly startUtcMillis: number;
  readonly endUtcMillis: number;
};

const THEME_STORAGE_KEY = 'budgetbros-theme';
const DARK_THEME: AppTheme = 'budgetbros';
const LIGHT_THEME: AppTheme = 'budgetbros-light';
const MIN_ACTIVITY_LOADING_MS = 1000;

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BudgetsPageComponent, TransactionsPageComponent, MoneyCountdownRowComponent],
  host: {
    '(document:click)': 'closeUserDropdownOnOutsideClick($event)',
    '(window:hashchange)': 'syncPageFromLocation()'
  }
})
export class App implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly budgetApiService = inject(BudgetApiService);
  private readonly userDropdown = viewChild<ElementRef<HTMLDetailsElement>>('userDropdown');

  protected readonly authStatus = this.authService.status;
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly isAuthConfigured = this.authService.isConfigured;
  protected readonly authErrorMessage = this.authService.errorMessage;
  private readonly currentUser = this.authService.user;

  protected readonly navLinks: readonly NavLink[] = [
    { label: 'Dashboard', href: '#dashboard', page: 'dashboard', hasPendingTransactions: false },
    { label: 'Budgets', href: '#budgets', page: 'budgets', hasPendingTransactions: false },
    {
      label: 'Transactions',
      href: '#transactions',
      page: 'transactions',
      hasPendingTransactions: true
    },
    { label: 'Goals', href: '#goals', page: 'goals', hasPendingTransactions: false },
    { label: 'Reports', href: '#reports', page: 'reports', hasPendingTransactions: false }
  ];
  protected readonly activePage = signal<AppPage>(this.readPageFromLocation());
  protected readonly activeTheme = signal<AppTheme>(this.readPersistedTheme());
  protected readonly isLightTheme = computed(() => this.activeTheme() === LIGHT_THEME);
  protected readonly themeToggleAriaLabel = computed(() =>
    this.isLightTheme() ? 'Switch to dark theme' : 'Switch to light theme'
  );

  protected readonly userName = computed(() => this.currentUser()?.name ?? 'Budget User');
  protected readonly memberSinceLabel = computed(() => {
    const createdAt = this.memberSinceDate();
    if (createdAt === null || createdAt === undefined) {
      return 'User since unknown';
    }

    const parsedTimestamp = Date.parse(createdAt);
    if (Number.isNaN(parsedTimestamp)) {
      return 'User since unknown';
    }

    return `User since ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(parsedTimestamp))}`;
  });
  protected readonly userAvatarInitial = computed(() => {
    const email = this.currentUser()?.email?.trim();
    if (email !== undefined && email.length > 0) {
      return email[0]?.toUpperCase() ?? 'B';
    }

    const fallback = this.userName().trim();
    return fallback.length > 0 ? (fallback[0]?.toUpperCase() ?? 'B') : 'B';
  });
  private readonly activePeriodDate = signal(this.startOfCurrentMonth());
  protected readonly activePeriod = computed(() =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(this.activePeriodDate())
  );
  protected readonly currentPeriodLabel = computed(() =>
    new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(this.startOfCurrentMonth())
  );
  protected readonly isViewingCurrentPeriod = computed(() =>
    this.isSameYearMonth(this.activePeriodDate(), this.startOfCurrentMonth())
  );
  private readonly earliestAvailablePeriod = computed(() => {
    const createdAt = this.memberSinceDate();
    if (createdAt === null) {
      return this.startOfCurrentMonth();
    }

    const parsedTimestamp = Date.parse(createdAt);
    if (Number.isNaN(parsedTimestamp)) {
      return this.startOfCurrentMonth();
    }

    const parsedDate = new Date(parsedTimestamp);
    return new Date(Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1));
  });
  protected readonly canViewPreviousPeriod = computed(() =>
    this.compareYearMonth(this.activePeriodDate(), this.earliestAvailablePeriod()) > 0
  );
  protected readonly canViewNextPeriod = computed(() =>
    this.compareYearMonth(this.activePeriodDate(), this.startOfCurrentMonth()) < 0
  );
  protected readonly budgetActivityRows = signal<readonly BudgetActivityRow[]>([]);
  protected readonly totalCategoryCount = signal(0);
  protected readonly budgetActivityLoading = signal(false);
  protected readonly budgetActivityError = signal<string | null>(null);
  protected readonly budgetActivityNotice = signal<string | null>(null);
  protected readonly budgetActivityInitialLoading = computed(
    () => this.budgetActivityLoading() && this.budgetActivityRows().length === 0
  );
  protected readonly budgetActivityRefreshing = computed(
    () => this.budgetActivityLoading() && this.budgetActivityRows().length > 0
  );
  protected readonly budgetActivityEmpty = computed(
    () =>
      !this.budgetActivityInitialLoading() &&
      this.budgetActivityError() === null &&
      this.budgetActivityRows().length === 0
  );
  protected readonly periodSummary = computed(() => {
    const rows = this.budgetActivityRows();
    return rows.reduce(
      (summary, row) => ({
        totalInflowInCents: summary.totalInflowInCents + row.monthlyInflowInCents,
        totalOutflowInCents: summary.totalOutflowInCents + row.monthlyOutflowInCents,
        totalNetInCents: summary.totalNetInCents + row.monthlyNetInCents,
        totalTransactionCount: summary.totalTransactionCount + row.transactionCount
      }),
      {
        totalInflowInCents: 0,
        totalOutflowInCents: 0,
        totalNetInCents: 0,
        totalTransactionCount: 0
      }
    );
  });
  protected readonly transactionsSummaryLabel = computed(() => {
    const transactionCount = this.periodSummary().totalTransactionCount;
    const countLabel = transactionCount.toLocaleString('en-US');
    const transactionLabel = transactionCount === 1 ? 'transaction' : 'transactions';
    const periodLabel = this.isViewingCurrentPeriod()
      ? 'this month'
      : `in ${this.activePeriod()}`;

    return `${countLabel} ${transactionLabel} ${periodLabel}`;
  });
  protected readonly budgetsSummaryLabel = computed(() => {
    const categoryCount = this.totalCategoryCount();
    const countLabel = categoryCount.toLocaleString('en-US');
    const categoryLabel = categoryCount === 1 ? 'active category' : 'active categories';

    return `${countLabel} ${categoryLabel}`;
  });
  private moneyRowsRequestId = 0;
  private readonly userCreatedAtState = signal<string | null>(null);
  private readonly memberSinceDate = computed(
    () => this.userCreatedAtState() ?? this.currentUser()?.createdAt ?? null
  );
  private userProfileRequestId = 0;

  constructor() {
    effect(() => {
      if (!this.isAuthenticated()) {
        this.resetMoneyRows();
        return;
      }

      void this.refreshMoneyRows();
    });

    effect(() => {
      if (!this.isAuthenticated()) {
        this.userCreatedAtState.set(null);
        this.userProfileRequestId += 1;
        return;
      }

      void this.loadCurrentUserCreatedAt();
    });
  }

  ngOnInit(): void {
    void this.authService.initialize();
    this.syncPageFromLocation();
  }

  protected setActivePage(page: AppPage): void {
    this.activePage.set(page);

    const targetHash = `#${page}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }

  protected isActivePage(page: AppPage): boolean {
    return this.activePage() === page;
  }

  protected reloadMoneyRows(): void {
    if (!this.isAuthenticated()) {
      return;
    }

    void this.refreshMoneyRows();
  }

  protected signIn(): void {
    void this.authService.signIn();
  }

  protected signOut(): void {
    this.authService.signOut();
  }

  protected viewPreviousPeriod(): void {
    if (!this.canViewPreviousPeriod()) {
      return;
    }

    this.loadPeriodFromMonthOffset(-1);
  }

  protected viewNextPeriod(): void {
    if (!this.canViewNextPeriod()) {
      return;
    }

    this.loadPeriodFromMonthOffset(1);
  }

  protected viewCurrentPeriod(): void {
    const currentPeriod = this.startOfCurrentMonth();
    if (this.isSameYearMonth(this.activePeriodDate(), currentPeriod)) {
      return;
    }

    if (this.isAuthenticated()) {
      void this.refreshMoneyRows(currentPeriod, true);
    }
  }

  protected setThemeFromToggle(isLightThemeEnabled: boolean): void {
    const nextTheme = isLightThemeEnabled ? LIGHT_THEME : DARK_THEME;
    this.activeTheme.set(nextTheme);
    this.persistTheme(nextTheme);
  }

  protected closeUserDropdownOnOutsideClick(event: Event): void {
    const userDropdown = this.userDropdown()?.nativeElement;
    if (userDropdown === undefined || !userDropdown.open) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      userDropdown.open = false;
      return;
    }

    if (!userDropdown.contains(target)) {
      userDropdown.open = false;
    }
  }

  protected netAmountClass(netInCents: number): string {
    if (netInCents > 0) {
      return 'text-success';
    }

    if (netInCents < 0) {
      return 'text-error';
    }

    return 'opacity-80';
  }

  protected syncPageFromLocation(): void {
    this.activePage.set(this.readPageFromLocation());
  }

  private readPageFromLocation(): AppPage {
    const hash = window.location.hash.replace(/^#/, '').trim().toLowerCase();

    switch (hash) {
      case 'budgets':
      case 'transactions':
      case 'goals':
      case 'reports':
        return hash;
      case 'dashboard':
      default:
        return 'dashboard';
    }
  }

  private resetMoneyRows(): void {
    this.moneyRowsRequestId += 1;
    this.budgetActivityRows.set([]);
    this.totalCategoryCount.set(0);
    this.budgetActivityLoading.set(false);
    this.budgetActivityError.set(null);
    this.budgetActivityNotice.set(null);
  }

  private async loadCurrentUserCreatedAt(): Promise<void> {
    const requestId = ++this.userProfileRequestId;

    try {
      const user = await firstValueFrom(this.budgetApiService.getCurrentUser());
      if (requestId !== this.userProfileRequestId) {
        return;
      }

      this.userCreatedAtState.set(this.extractCreatedAtFromUserResponse(user));
    } catch {
      if (requestId !== this.userProfileRequestId) {
        return;
      }

      this.userCreatedAtState.set(null);
    }
  }

  private extractCreatedAtFromUserResponse(user: UserResponse): string | null {
    const candidates: readonly unknown[] = [
      user.created_at,
      user.createdAt,
      user.user_create_date,
      user.userCreateDate,
      user['UserCreateDate'],
      user['created']
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeDateCandidate(candidate);
      if (normalized !== null) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeDateCandidate(value: unknown): string | null {
    if (typeof value === 'number') {
      return this.normalizeEpochDate(value);
    }

    if (typeof value !== 'string') {
      return null;
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return null;
    }

    const numeric = Number(trimmedValue);
    if (Number.isFinite(numeric)) {
      return this.normalizeEpochDate(numeric);
    }

    const parsedTimestamp = Date.parse(trimmedValue);
    if (Number.isNaN(parsedTimestamp)) {
      return null;
    }

    return new Date(parsedTimestamp).toISOString();
  }

  private normalizeEpochDate(value: number): string | null {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const parsedDate = new Date(millis);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
  }

  private async refreshMoneyRows(
    targetPeriodDate: Date = this.activePeriodDate(),
    commitPeriodOnSuccess = false
  ): Promise<void> {
    const requestId = ++this.moneyRowsRequestId;
    const requestStartedAt = Date.now();
    this.budgetActivityLoading.set(true);
    this.budgetActivityError.set(null);
    this.budgetActivityNotice.set(null);

    try {
      const budgets = await firstValueFrom(this.budgetApiService.listBudgets());
      if (budgets.length === 0) {
        if (requestId !== this.moneyRowsRequestId) {
          return;
        }

        if (commitPeriodOnSuccess) {
          this.activePeriodDate.set(targetPeriodDate);
        }
        this.budgetActivityRows.set([]);
        this.totalCategoryCount.set(0);
        return;
      }

      const periodRange = this.currentPeriodRange(targetPeriodDate);
      const rowResults = await Promise.allSettled(
        budgets.map((budget) => this.loadBudgetActivitySnapshot(budget, periodRange))
      );

      if (requestId !== this.moneyRowsRequestId) {
        return;
      }

      const snapshots = rowResults
        .filter(
          (result): result is PromiseFulfilledResult<BudgetActivitySnapshot> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);
      const failures = rowResults.length - snapshots.length;

      if (snapshots.length === 0) {
        const firstFailure = rowResults.find((result) => result.status === 'rejected');
        throw firstFailure?.reason ?? new Error('Could not load any budget activity data.');
      }

      const rows = snapshots.map((snapshot) => snapshot.row);
      const totalCategoryCount = snapshots.reduce(
        (categoryCount, snapshot) => categoryCount + snapshot.categoryCount,
        0
      );

      if (commitPeriodOnSuccess) {
        this.activePeriodDate.set(targetPeriodDate);
      }
      this.totalCategoryCount.set(totalCategoryCount);
      this.budgetActivityRows.set(
        [...rows].sort(
          (a, b) =>
            b.monthlyOutflowInCents - a.monthlyOutflowInCents || a.label.localeCompare(b.label)
        )
      );
      if (failures > 0) {
        this.budgetActivityNotice.set(
          'Some budgets could not be loaded right now. Showing available activity.'
        );
      }
    } catch (error) {
      if (requestId !== this.moneyRowsRequestId) {
        return;
      }

      this.budgetActivityError.set(this.mapMoneyRowsError(error));
      this.budgetActivityRows.set([]);
      this.totalCategoryCount.set(0);
    } finally {
      if (requestId === this.moneyRowsRequestId) {
        await this.waitForMinimumLoadingDuration(requestStartedAt);
      }

      if (requestId === this.moneyRowsRequestId) {
        this.budgetActivityLoading.set(false);
      }
    }
  }

  private async loadBudgetActivitySnapshot(
    budget: BudgetResponse,
    periodRange: PeriodRange
  ): Promise<BudgetActivitySnapshot> {
    const [transactions, categories] = await Promise.all([
      firstValueFrom(this.budgetApiService.listTransactions(budget.id)),
      firstValueFrom(this.budgetApiService.listCategories(budget.id))
    ]);
    const summary = this.summarizeTransactions(transactions, periodRange);

    return {
      row: {
        id: budget.id,
        label: budget.name,
        currencyCode: budget.base_currency_code,
        monthlyInflowInCents: summary.monthlyInflowInCents,
        monthlyOutflowInCents: summary.monthlyOutflowInCents,
        monthlyNetInCents: summary.monthlyInflowInCents - summary.monthlyOutflowInCents,
        transactionCount: summary.transactionCount
      },
      categoryCount: categories.length
    };
  }

  private summarizeTransactions(
    transactions: readonly TransactionResponse[],
    periodRange: PeriodRange
  ): {
    readonly monthlyInflowInCents: number;
    readonly monthlyOutflowInCents: number;
    readonly transactionCount: number;
  } {
    return transactions.reduce(
      (summary, transaction) => {
        const lines = this.transactionLines(transaction);
        if (lines.length === 0) {
          return summary;
        }

        const inActivePeriod = this.isTransactionInRange(transaction, periodRange);

        const lineSummary = lines.reduce(
          (lineTotals, line) => {
            const amount = this.normalizeSignedLineAmountInCents(line);
            if (amount > 0) {
              return {
                inflowInCents: lineTotals.inflowInCents + amount,
                outflowInCents: lineTotals.outflowInCents
              };
            }

            if (amount < 0) {
              return {
                inflowInCents: lineTotals.inflowInCents,
                outflowInCents: lineTotals.outflowInCents + Math.abs(amount)
              };
            }

            return lineTotals;
          },
          {
            inflowInCents: 0,
            outflowInCents: 0
          }
        );

        return {
          monthlyInflowInCents: inActivePeriod
            ? summary.monthlyInflowInCents + lineSummary.inflowInCents
            : summary.monthlyInflowInCents,
          monthlyOutflowInCents: inActivePeriod
            ? summary.monthlyOutflowInCents + lineSummary.outflowInCents
            : summary.monthlyOutflowInCents,
          transactionCount: inActivePeriod
            ? summary.transactionCount + 1
            : summary.transactionCount
        };
      },
      {
        monthlyInflowInCents: 0,
        monthlyOutflowInCents: 0,
        transactionCount: 0
      }
    );
  }

  private normalizeSignedLineAmountInCents(line: TransactionLineResponse): number {
    const amount = line.amount_minor;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return 0;
    }

    return Math.trunc(amount);
  }

  private transactionLines(transaction: TransactionResponse): readonly TransactionLineResponse[] {
    if (Array.isArray(transaction.lines)) {
      return transaction.lines;
    }

    const maybeSingleLine = transaction['line'];
    if (isRecord(maybeSingleLine) && typeof maybeSingleLine['amount_minor'] === 'number') {
      return [maybeSingleLine as TransactionLineResponse];
    }

    return [];
  }

  private isTransactionInRange(transaction: TransactionResponse, periodRange: PeriodRange): boolean {
    const parsedTimestamp = Date.parse(transaction.posted_at ?? transaction.created_at ?? '');
    if (Number.isNaN(parsedTimestamp)) {
      return true;
    }

    return (
      parsedTimestamp >= periodRange.startUtcMillis && parsedTimestamp < periodRange.endUtcMillis
    );
  }

  private startOfCurrentMonth(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private currentPeriodRange(activeMonthDate: Date): PeriodRange {
    const startUtcMillis = Date.UTC(
      activeMonthDate.getUTCFullYear(),
      activeMonthDate.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const endUtcMillis = Date.UTC(
      activeMonthDate.getUTCFullYear(),
      activeMonthDate.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

    return {
      startUtcMillis,
      endUtcMillis
    };
  }

  private loadPeriodFromMonthOffset(monthOffset: number): void {
    const period = this.activePeriodDate();
    const nextPeriod = new Date(
      Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0)
    );

    if (this.isAuthenticated()) {
      void this.refreshMoneyRows(nextPeriod, true);
    }
  }

  private isSameYearMonth(left: Date, right: Date): boolean {
    return (
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth()
    );
  }

  private compareYearMonth(left: Date, right: Date): number {
    const leftYear = left.getUTCFullYear();
    const rightYear = right.getUTCFullYear();
    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return left.getUTCMonth() - right.getUTCMonth();
  }

  private async waitForMinimumLoadingDuration(requestStartedAt: number): Promise<void> {
    const elapsedMs = Date.now() - requestStartedAt;
    const remainingMs = MIN_ACTIVITY_LOADING_MS - elapsedMs;
    if (remainingMs <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), remainingMs);
    });
  }

  private mapMoneyRowsError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Live budget data is temporarily unavailable. Please try again in a moment.';
      }

      if (error.status === 401 || error.status === 403) {
        return 'Your session is not authorized for budget data. Please sign in again.';
      }

      if (error.status === 404) {
        return 'No budgets yet. Create your first budget to start tracking totals.';
      }
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return `Could not load budget activity totals: ${error.message}`;
    }

    return 'Could not load budget activity totals. Try again.';
  }

  private readPersistedTheme(): AppTheme {
    if (!this.canAccessLocalStorage()) {
      return DARK_THEME;
    }

    try {
      const storedTheme = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === DARK_THEME || storedTheme === LIGHT_THEME) {
        return storedTheme;
      }
    } catch {
      return DARK_THEME;
    }

    return DARK_THEME;
  }

  private persistTheme(theme: AppTheme): void {
    if (!this.canAccessLocalStorage()) {
      return;
    }

    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore persistence errors and keep runtime theme state in memory.
    }
  }

  private canAccessLocalStorage(): boolean {
    return typeof globalThis.localStorage !== 'undefined';
  }

  private extractHttpErrorDetails(error: HttpErrorResponse): string | null {
    const payload = error.error;

    if (typeof payload === 'string' && payload.trim().length > 0) {
      return payload.trim();
    }

    if (!isRecord(payload)) {
      return null;
    }

    const detail = payload['detail'];
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail.trim();
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (isRecord(item) && typeof item['msg'] === 'string' ? item['msg'].trim() : ''))
        .filter((message) => message.length > 0);

      if (messages.length > 0) {
        return messages.join('; ');
      }
    }

    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
