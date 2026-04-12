import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { DatepickerDirective } from '../datepicker/datepicker.directive';
import { BudgetApiService } from '../api/budget-api.service';
import {
  AccountResponse,
  BudgetResponse,
  CategoryResponse,
  PayeeResponse,
  TransactionLineResponse,
  TransactionResponse,
  TransactionStatus,
} from '../api/budget-api.models';

type TransactionFormModel = {
  readonly accountId: FormControl<string>;
  readonly amount: FormControl<number>;
  readonly isOutflow: FormControl<boolean>;
  readonly postedAt: FormControl<string>;
  readonly status: FormControl<string>;
  readonly memo: FormControl<string>;
  readonly notes: FormControl<string>;
};

type EditTransactionFormModel = {
  readonly accountId: FormControl<string>;
  readonly amount: FormControl<string>;
  readonly isOutflow: FormControl<boolean>;
  readonly postedAt: FormControl<string>;
  readonly status: FormControl<string>;
  readonly payeeId: FormControl<string>;
  readonly categoryId: FormControl<string>;
  readonly memo: FormControl<string>;
  readonly notes: FormControl<string>;
};

@Component({
  selector: 'app-transactions-page',
  imports: [ReactiveFormsModule, DatepickerDirective],
  templateUrl: './transactions-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'handleDocumentClick($event)',
    '(document:keydown.escape)': 'closeTransientUi()',
  },
})
export class TransactionsPageComponent implements OnInit, OnDestroy {
  private readonly budgetApiService = inject(BudgetApiService);
  private readonly minimumLoadingIndicatorDurationInMs = 1000;
  private readonly budgetSwitcherDropdown =
    viewChild<ElementRef<HTMLDivElement>>('budgetSwitcherDropdown');
  private readonly createTransactionDropdown =
    viewChild<ElementRef<HTMLDivElement>>('createTransactionDropdown');
  private readonly createStatusDropdownEl =
    viewChild<ElementRef<HTMLDivElement>>('createStatusDropdown');
  private readonly editStatusDropdownEl =
    viewChild<ElementRef<HTMLDivElement>>('editStatusDropdown');
  private readonly deleteDropdownEl =
    viewChild<ElementRef<HTMLDivElement>>('deleteDropdown');
  private readonly deleteConfirmationPanelEl =
    viewChild<ElementRef<HTMLDivElement>>('deleteConfirmationPanel');
  private suppressNextEditCancel = false;
  private loadingRequestCount = 0;
  private loadingIndicatorStartedAt = 0;
  private loadingIndicatorTimeoutId: ReturnType<typeof setTimeout> | null = null;

  protected readonly budgets = signal<readonly BudgetResponse[]>([]);
  protected readonly transactions = signal<readonly TransactionResponse[]>([]);
  protected readonly accounts = signal<readonly AccountResponse[]>([]);
  protected readonly categories = signal<readonly CategoryResponse[]>([]);
  protected readonly payees = signal<readonly PayeeResponse[]>([]);
  protected readonly selectedBudgetId = signal<string | null>(null);
  protected readonly budgetsLoading = signal(false);
  protected readonly budgetsError = signal<string | null>(null);
  protected readonly transactionsLoading = signal(false);
  protected readonly transactionsError = signal<string | null>(null);
  protected readonly pageLoadingIndicatorVisible = signal(false);
  protected readonly budgetSwitcherOpen = signal(false);
  protected readonly createTransactionFormVisible = signal(false);
  protected readonly transactionSubmitting = signal(false);
  protected readonly transactionSubmitError = signal<string | null>(null);
  protected readonly deleteConfirmationTransactionId = signal<string | null>(null);
  protected readonly transactionActionPending = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly editingTransactionId = signal<string | null>(null);
  protected readonly editTransactionSubmitError = signal<string | null>(null);
  protected readonly createStatusDropdownOpen = signal(false);
  protected readonly editStatusDropdownOpen = signal(false);
  protected readonly deleteDropdownCoords = signal<{ top?: number; bottom?: number; right: number } | null>(null);
  protected readonly createFormStatus = signal<string>('cleared');
  protected readonly editFormStatus = signal<string>('cleared');

  protected readonly editTransactionForm = new FormGroup<EditTransactionFormModel>({
    accountId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    isOutflow: new FormControl(true, { nonNullable: true }),
    postedAt: new FormControl('', { nonNullable: true }),
    status: new FormControl('cleared', { nonNullable: true }),
    payeeId: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl('', { nonNullable: true }),
    memo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    notes: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  protected readonly transactionForm = new FormGroup<TransactionFormModel>({
    accountId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    amount: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    isOutflow: new FormControl(true, { nonNullable: true }),
    postedAt: new FormControl('', { nonNullable: true }),
    status: new FormControl('cleared', { nonNullable: true }),
    memo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
    notes: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(500)],
    }),
  });

  protected readonly activeBudget = computed(
    () => this.budgets().find((budget) => budget.id === this.selectedBudgetId()) ?? null,
  );
  protected readonly hasBudgets = computed(() => this.budgets().length > 0);
  protected readonly hasAccounts = computed(() => this.accounts().length > 0);
  protected readonly hasTransactions = computed(() => this.transactions().length > 0);
  protected readonly showNoBudgetsState = computed(
    () => !this.budgetsLoading() && this.budgetsError() === null && !this.hasBudgets(),
  );
  protected readonly showNoTransactionsState = computed(
    () =>
      this.activeBudget() !== null &&
      !this.transactionsLoading() &&
      this.transactionsError() === null &&
      !this.hasTransactions(),
  );
  protected readonly sortedTransactions = computed(() =>
    [...this.transactions()].sort((a, b) => {
      const aDate = Date.parse(a.posted_at ?? a.created_at ?? '');
      const bDate = Date.parse(b.posted_at ?? b.created_at ?? '');
      if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
      if (Number.isNaN(aDate)) return 1;
      if (Number.isNaN(bDate)) return -1;
      return bDate - aDate;
    }),
  );
  protected readonly editingTransaction = computed(
    () => this.transactions().find((t) => t.id === this.editingTransactionId()) ?? null,
  );

  ngOnInit(): void {
    void this.loadBudgets();
  }

  ngOnDestroy(): void {
    this.clearLoadingIndicatorTimeout();
  }

  protected selectBudget(budgetId: string): void {
    if (budgetId === this.selectedBudgetId()) {
      this.budgetSwitcherOpen.set(false);
      return;
    }

    this.selectedBudgetId.set(budgetId);
    this.budgetSwitcherOpen.set(false);
    this.transactions.set([]);
    this.accounts.set([]);
    this.categories.set([]);
    this.payees.set([]);
    this.transactionsError.set(null);
    void this.loadTransactionsAndDependencies(budgetId);
  }

  protected toggleBudgetSwitcher(): void {
    if (!this.hasBudgets()) return;
    this.budgetSwitcherOpen.update((isOpen) => !isOpen);
  }

  protected showCreateTransactionForm(): void {
    if (this.activeBudget() === null) return;

    if (!this.transactionForm.controls.accountId.value && this.accounts().length > 0) {
      this.transactionForm.controls.accountId.setValue(this.accounts()[0].id);
    }
    this.transactionForm.controls.postedAt.setValue(this.todayDateString());

    this.createTransactionFormVisible.set(true);
    this.transactionSubmitError.set(null);
  }

  protected hideCreateTransactionForm(): void {
    this.createTransactionFormVisible.set(false);
    this.transactionSubmitError.set(null);
    this.createFormStatus.set('cleared');
    this.createStatusDropdownOpen.set(false);
    this.transactionForm.reset({
      accountId: this.accounts()[0]?.id ?? '',
      amount: 0,
      isOutflow: true,
      postedAt: this.todayDateString(),
      status: 'cleared',
      memo: '',
      notes: '',
    });
  }

  protected async createTransaction(): Promise<void> {
    const budget = this.activeBudget();
    if (budget === null || this.transactionSubmitting()) return;

    if (this.transactionForm.invalid) {
      this.transactionForm.markAllAsTouched();
      return;
    }

    const controls = this.transactionForm.controls;
    const amountDollars = controls.amount.getRawValue();
    const amountMinor = Math.round(amountDollars * 100);
    const isOutflow = controls.isOutflow.getRawValue();
    const signedAmountMinor = isOutflow ? -Math.abs(amountMinor) : Math.abs(amountMinor);
    const postedAt = controls.postedAt.getRawValue().trim();
    const memo = controls.memo.getRawValue().trim();
    const notes = controls.notes.getRawValue().trim();
    const status = controls.status.getRawValue() as TransactionStatus;

    this.transactionSubmitting.set(true);
    this.transactionSubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.createTransaction(budget.id, {
          posted_at: postedAt || null,
          status: status || null,
          notes: notes || null,
          line: {
            account_id: controls.accountId.getRawValue(),
            amount_minor: signedAmountMinor,
            memo: memo || null,
          },
        }),
      );

      this.hideCreateTransactionForm();
      await this.loadTransactions(budget.id);
    } catch (error) {
      this.transactionSubmitError.set(
        this.mapError(error, 'Could not create the transaction right now.'),
      );
    } finally {
      this.transactionSubmitting.set(false);
    }
  }

  protected showDeleteConfirmation(transactionId: string, trigger?: EventTarget | null): void {
    if (trigger instanceof HTMLElement) {
      const rect = trigger.getBoundingClientRect();
      const openUpward = window.innerHeight - rect.bottom < 180;
      this.deleteDropdownCoords.set(
        openUpward
          ? { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 4, right: window.innerWidth - rect.right },
      );
    }
    this.deleteConfirmationTransactionId.set(transactionId);
    this.deleteError.set(null);
  }

  protected hideDeleteConfirmation(): void {
    this.deleteConfirmationTransactionId.set(null);
    this.deleteError.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const budget = this.activeBudget();
    const transactionId = this.deleteConfirmationTransactionId();
    if (budget === null || transactionId === null || this.transactionActionPending()) return;

    this.transactionActionPending.set(true);
    this.deleteError.set(null);

    try {
      await firstValueFrom(this.budgetApiService.deleteTransaction(budget.id, transactionId));
      this.hideDeleteConfirmation();
      this.cancelEditing();
      await this.loadTransactions(budget.id);
    } catch (error) {
      this.deleteError.set(this.mapError(error, 'Could not delete the transaction right now.'));
    } finally {
      this.transactionActionPending.set(false);
    }
  }

  protected startEditing(transaction: TransactionResponse): void {
    this.suppressNextEditCancel = true;
    const line = this.primaryLine(transaction);
    const amountMinor = this.transactionAmountMinor(transaction);

    this.editTransactionForm.reset({
      accountId: line?.account_id ?? '',
      amount: (Math.abs(amountMinor) / 100).toFixed(2),
      isOutflow: amountMinor <= 0,
      postedAt: transaction.posted_at?.slice(0, 10) ?? '',
      status: transaction.status ?? 'cleared',
      payeeId: line?.payee_id ?? '',
      categoryId: line?.category_id ?? '',
      memo: line?.memo ?? '',
      notes: transaction.notes ?? '',
    });

    this.editFormStatus.set(transaction.status ?? 'cleared');
    this.editingTransactionId.set(transaction.id);
    this.editTransactionSubmitError.set(null);
  }

  protected cancelEditing(): void {
    this.editingTransactionId.set(null);
    this.editTransactionSubmitError.set(null);
    this.editTransactionForm.reset();
  }

  protected async saveTransactionEdit(): Promise<void> {
    const budget = this.activeBudget();
    const transactionId = this.editingTransactionId();
    if (budget === null || transactionId === null || this.transactionActionPending()) return;

    if (this.editTransactionForm.invalid) {
      this.editTransactionForm.markAllAsTouched();
      return;
    }

    const controls = this.editTransactionForm.controls;
    const amountMinor = Math.round(parseFloat(controls.amount.getRawValue()) * 100);
    const signedAmountMinor = controls.isOutflow.getRawValue()
      ? -Math.abs(amountMinor)
      : Math.abs(amountMinor);
    const payeeId = controls.payeeId.getRawValue().trim() || null;
    const categoryId = controls.categoryId.getRawValue().trim() || null;
    const postedAt = controls.postedAt.getRawValue().trim() || null;
    const memo = controls.memo.getRawValue().trim() || null;
    const notes = controls.notes.getRawValue().trim() || null;
    const status = (controls.status.getRawValue() as TransactionStatus) || null;

    this.transactionActionPending.set(true);
    this.editTransactionSubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.updateTransaction(budget.id, transactionId, {
          posted_at: postedAt,
          status,
          notes,
          lines: [
            {
              account_id: controls.accountId.getRawValue(),
              amount_minor: signedAmountMinor,
              payee_id: payeeId,
              category_id: categoryId,
              memo,
            },
          ],
        }),
      );

      this.cancelEditing();
      await this.loadTransactions(budget.id);
    } catch (error) {
      this.editTransactionSubmitError.set(
        this.mapError(error, 'Could not save the transaction right now.'),
      );
    } finally {
      this.transactionActionPending.set(false);
    }
  }

  protected toggleCreateStatusDropdown(): void {
    this.createStatusDropdownOpen.update((v) => !v);
  }

  protected selectCreateStatus(status: string): void {
    this.createFormStatus.set(status);
    this.transactionForm.controls.status.setValue(status);
    this.createStatusDropdownOpen.set(false);
  }

  protected toggleEditStatusDropdown(): void {
    this.editStatusDropdownOpen.update((v) => !v);
  }

  protected selectEditStatus(status: string): void {
    this.editFormStatus.set(status);
    this.editTransactionForm.controls.status.setValue(status);
    this.editStatusDropdownOpen.set(false);
  }

  protected handleDocumentClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Node)) return;

    const budgetSwitcher = this.budgetSwitcherDropdown()?.nativeElement;
    if (
      this.budgetSwitcherOpen() &&
      budgetSwitcher !== undefined &&
      !budgetSwitcher.contains(target)
    ) {
      this.budgetSwitcherOpen.set(false);
    }

    const createDropdown = this.createTransactionDropdown()?.nativeElement;
    if (
      this.createTransactionFormVisible() &&
      createDropdown !== undefined &&
      !createDropdown.contains(target)
    ) {
      this.hideCreateTransactionForm();
    }

    const createStatusDropdown = this.createStatusDropdownEl()?.nativeElement;
    if (
      this.createStatusDropdownOpen() &&
      createStatusDropdown !== undefined &&
      !createStatusDropdown.contains(target)
    ) {
      this.createStatusDropdownOpen.set(false);
    }

    const editStatusDropdown = this.editStatusDropdownEl()?.nativeElement;
    if (
      this.editStatusDropdownOpen() &&
      editStatusDropdown !== undefined &&
      !editStatusDropdown.contains(target)
    ) {
      this.editStatusDropdownOpen.set(false);
    }

    const deleteDropdown = this.deleteDropdownEl()?.nativeElement;
    const deletePanel = this.deleteConfirmationPanelEl()?.nativeElement;
    if (
      this.deleteConfirmationTransactionId() !== null &&
      (deleteDropdown === undefined || !deleteDropdown.contains(target)) &&
      (deletePanel === undefined || !deletePanel.contains(target))
    ) {
      this.hideDeleteConfirmation();
    }

    if (this.editingTransactionId() !== null) {
      if (this.suppressNextEditCancel) {
        this.suppressNextEditCancel = false;
      } else {
        const isInEditRow = target instanceof Element && target.closest('[data-edit-row]') !== null;
        const isInDeletePanel = deletePanel !== undefined && deletePanel.contains(target);
        if (!isInEditRow && !isInDeletePanel) {
          this.cancelEditing();
        }
      }
    }
  }

  protected closeTransientUi(): void {
    this.budgetSwitcherOpen.set(false);
    this.createStatusDropdownOpen.set(false);
    this.editStatusDropdownOpen.set(false);
    this.hideCreateTransactionForm();
    this.hideDeleteConfirmation();
    this.cancelEditing();
  }

  protected formatDate(value: string | undefined): string {
    if (value === undefined) return '—';
    const parsedTimestamp = Date.parse(value);
    if (Number.isNaN(parsedTimestamp)) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(parsedTimestamp));
  }

  protected formatCurrencyAmount(amountInCents: number, currencyCode: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode.trim().toUpperCase() || 'USD',
    }).format(Math.abs(amountInCents) / 100);
  }

  protected transactionAmountMinor(transaction: TransactionResponse): number {
    return this.transactionLines(transaction).reduce((sum, line) => {
      const amount = line.amount_minor;
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return sum;
      return sum + Math.trunc(amount);
    }, 0);
  }

  protected isOutflow(transaction: TransactionResponse): boolean {
    return this.transactionAmountMinor(transaction) < 0;
  }

  protected primaryLine(transaction: TransactionResponse): TransactionLineResponse | null {
    return this.transactionLines(transaction)[0] ?? null;
  }

  protected accountName(accountId: string | undefined): string {
    if (accountId === undefined) return '—';
    return this.accounts().find((a) => a.id === accountId)?.name ?? '—';
  }

  protected categoryName(categoryId: string | null | undefined): string {
    if (categoryId === null || categoryId === undefined) return '—';
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }

  protected payeeName(payeeId: string | null | undefined): string {
    if (payeeId === null || payeeId === undefined) return '—';
    return this.payees().find((p) => p.id === payeeId)?.name ?? '—';
  }

  protected statusBadgeClass(status: TransactionStatus | undefined): string {
    switch (status) {
      case 'cleared':
        return 'badge badge-success badge-sm';
      case 'reconciled':
        return 'badge badge-info badge-sm';
      default:
        return 'badge badge-warning badge-sm';
    }
  }

  protected statusLabel(status: TransactionStatus | undefined): string {
    if (status === undefined || status.trim().length === 0) return 'Pending';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private transactionLines(transaction: TransactionResponse): readonly TransactionLineResponse[] {
    if (Array.isArray(transaction.lines)) {
      return transaction.lines;
    }

    const maybeSingleLine = transaction['line'];
    if (
      typeof maybeSingleLine === 'object' &&
      maybeSingleLine !== null &&
      typeof (maybeSingleLine as Record<string, unknown>)['amount_minor'] === 'number'
    ) {
      return [maybeSingleLine as TransactionLineResponse];
    }

    return [];
  }

  private todayDateString(): string {
    const today = new Date();
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  }

  private async loadBudgets(preferredBudgetId: string | null = null): Promise<void> {
    this.beginPageLoading();
    this.budgetsLoading.set(true);
    this.budgetsError.set(null);

    try {
      const budgets = await firstValueFrom(this.budgetApiService.listBudgets());
      this.budgets.set(budgets);

      if (budgets.length === 0) {
        this.selectedBudgetId.set(null);
        this.transactions.set([]);
        this.accounts.set([]);
        this.categories.set([]);
        this.payees.set([]);
        return;
      }

      const nextBudgetId = this.resolveBudgetSelection(budgets, preferredBudgetId);
      this.selectedBudgetId.set(nextBudgetId);
      await this.loadTransactionsAndDependencies(nextBudgetId);
    } catch (error) {
      this.budgets.set([]);
      this.selectedBudgetId.set(null);
      this.transactions.set([]);
      this.accounts.set([]);
      this.categories.set([]);
      this.payees.set([]);
      this.budgetsError.set(this.mapError(error, 'Could not load your budgets right now.'));
    } finally {
      this.budgetsLoading.set(false);
      this.endPageLoading();
    }
  }

  private async loadTransactionsAndDependencies(budgetId: string): Promise<void> {
    this.beginPageLoading();
    this.transactionsLoading.set(true);
    this.transactionsError.set(null);

    try {
      const [transactions, accounts, categories, payees] = await Promise.all([
        firstValueFrom(this.budgetApiService.listTransactions(budgetId)),
        firstValueFrom(this.budgetApiService.listAccounts(budgetId)),
        firstValueFrom(this.budgetApiService.listCategories(budgetId)),
        firstValueFrom(this.budgetApiService.listPayees(budgetId)),
      ]);
      this.transactions.set(transactions);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.payees.set(payees);
    } catch (error) {
      this.transactions.set([]);
      this.accounts.set([]);
      this.categories.set([]);
      this.payees.set([]);
      this.transactionsError.set(
        this.mapError(error, 'Could not load transactions right now.'),
      );
    } finally {
      this.transactionsLoading.set(false);
      this.endPageLoading();
    }
  }

  private async loadTransactions(budgetId: string): Promise<void> {
    this.beginPageLoading();
    this.transactionsLoading.set(true);
    this.transactionsError.set(null);

    try {
      const transactions = await firstValueFrom(
        this.budgetApiService.listTransactions(budgetId),
      );
      this.transactions.set(transactions);
    } catch (error) {
      this.transactions.set([]);
      this.transactionsError.set(
        this.mapError(error, 'Could not load transactions right now.'),
      );
    } finally {
      this.transactionsLoading.set(false);
      this.endPageLoading();
    }
  }

  private resolveBudgetSelection(
    budgets: readonly BudgetResponse[],
    preferredBudgetId: string | null,
  ): string {
    if (
      preferredBudgetId !== null &&
      budgets.some((budget) => budget.id === preferredBudgetId)
    ) {
      return preferredBudgetId;
    }

    const currentBudgetId = this.selectedBudgetId();
    if (
      currentBudgetId !== null &&
      budgets.some((budget) => budget.id === currentBudgetId)
    ) {
      return currentBudgetId;
    }

    return budgets[0].id;
  }

  private beginPageLoading(): void {
    this.loadingRequestCount += 1;
    if (this.loadingRequestCount > 1) return;
    this.clearLoadingIndicatorTimeout();
    this.loadingIndicatorStartedAt = Date.now();
    this.pageLoadingIndicatorVisible.set(true);
  }

  private endPageLoading(): void {
    this.loadingRequestCount = Math.max(0, this.loadingRequestCount - 1);
    if (this.loadingRequestCount > 0) return;

    const elapsed = Date.now() - this.loadingIndicatorStartedAt;
    const remainingDuration = Math.max(0, this.minimumLoadingIndicatorDurationInMs - elapsed);

    if (remainingDuration === 0) {
      this.pageLoadingIndicatorVisible.set(false);
      return;
    }

    this.clearLoadingIndicatorTimeout();
    this.loadingIndicatorTimeoutId = setTimeout(() => {
      this.loadingIndicatorTimeoutId = null;
      if (this.loadingRequestCount === 0) {
        this.pageLoadingIndicatorVisible.set(false);
      }
    }, remainingDuration);
  }

  private clearLoadingIndicatorTimeout(): void {
    if (this.loadingIndicatorTimeoutId === null) return;
    clearTimeout(this.loadingIndicatorTimeoutId);
    this.loadingIndicatorTimeoutId = null;
  }

  private mapError(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const responseMessage = this.readResponseMessage(error.error);
      if (responseMessage !== null) return responseMessage;
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return fallbackMessage;
  }

  private readResponseMessage(errorBody: unknown): string | null {
    if (typeof errorBody === 'string' && errorBody.trim().length > 0) {
      return errorBody.trim();
    }

    if (typeof errorBody !== 'object' || errorBody === null) {
      return null;
    }

    const message = (errorBody as Record<string, unknown>)['message'];
    return typeof message === 'string' && message.trim().length > 0 ? message.trim() : null;
  }
}
