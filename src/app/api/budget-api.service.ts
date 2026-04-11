import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { Observable } from 'rxjs';

import { BUDGET_API_BASE_URL } from './budget-api.config';
import {
  AccountCreate,
  AccountResponse,
  AccountUpdate,
  BudgetCreate,
  BudgetMemberCreate,
  BudgetMemberResponse,
  BudgetResponse,
  BudgetUpdate,
  CategoryCreate,
  CategoryDelete,
  CategoryResponse,
  CategoryUpdate,
  CurrencyResponse,
  EntityId,
  PayeeCreate,
  PayeeResponse,
  PayeeUpdate,
  TagCreate,
  TagResponse,
  TagUpdate,
  TransactionBulkCreate,
  TransactionCreate,
  TransactionImportSummary,
  TransactionResponse,
  TransactionSplitCreate,
  TransactionUpdate,
  TransferCreate,
  UserResponse
} from './budget-api.models';

@Injectable({ providedIn: 'root' })
export class BudgetApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly oauthService = inject(OAuthService);
  private readonly baseUrl = inject(BUDGET_API_BASE_URL);

  getRoot(): Observable<unknown> {
    return this.httpClient.get<unknown>(this.url('/'), this.httpOptions());
  }

  getCurrentUser(): Observable<UserResponse> {
    return this.httpClient.get<UserResponse>(this.url('/users/me'), this.httpOptions());
  }

  listCurrencies(): Observable<readonly CurrencyResponse[]> {
    return this.httpClient.get<readonly CurrencyResponse[]>(
      this.url('/currencies'),
      this.httpOptions()
    );
  }

  listBudgets(): Observable<readonly BudgetResponse[]> {
    return this.httpClient.get<readonly BudgetResponse[]>(this.url('/budgets'), this.httpOptions());
  }

  createBudget(payload: BudgetCreate): Observable<BudgetResponse> {
    return this.httpClient.post<BudgetResponse>(this.url('/budgets'), payload, this.httpOptions());
  }

  updateBudget(budgetId: EntityId, payload: BudgetUpdate): Observable<BudgetResponse> {
    return this.httpClient.patch<BudgetResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}`),
      payload,
      this.httpOptions()
    );
  }

  deleteBudget(budgetId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}`),
      this.httpOptions()
    );
  }

  createBudgetMember(budgetId: EntityId, payload: BudgetMemberCreate): Observable<BudgetMemberResponse> {
    return this.httpClient.post<BudgetMemberResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/members`),
      payload,
      this.httpOptions()
    );
  }

  listBudgetMembers(budgetId: EntityId): Observable<readonly BudgetMemberResponse[]> {
    return this.httpClient.get<readonly BudgetMemberResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/members`),
      this.httpOptions()
    );
  }

  deleteBudgetMember(budgetId: EntityId, userId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/members/${encodeURIComponent(userId)}`),
      this.httpOptions()
    );
  }

  createAccount(budgetId: EntityId, payload: AccountCreate): Observable<AccountResponse> {
    return this.httpClient.post<AccountResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/accounts`),
      payload,
      this.httpOptions()
    );
  }

  listAccounts(budgetId: EntityId): Observable<readonly AccountResponse[]> {
    return this.httpClient.get<readonly AccountResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/accounts`),
      this.httpOptions()
    );
  }

  updateAccount(
    budgetId: EntityId,
    accountId: EntityId,
    payload: AccountUpdate
  ): Observable<AccountResponse> {
    return this.httpClient.patch<AccountResponse>(
      this.url(
        `/budgets/${encodeURIComponent(budgetId)}/accounts/${encodeURIComponent(accountId)}`
      ),
      payload,
      this.httpOptions()
    );
  }

  deleteAccount(budgetId: EntityId, accountId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/accounts/${encodeURIComponent(accountId)}`),
      this.httpOptions()
    );
  }

  createCategory(budgetId: EntityId, payload: CategoryCreate): Observable<CategoryResponse> {
    return this.httpClient.post<CategoryResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/categories`),
      payload,
      this.httpOptions()
    );
  }

  listCategories(budgetId: EntityId): Observable<readonly CategoryResponse[]> {
    return this.httpClient.get<readonly CategoryResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/categories`),
      this.httpOptions()
    );
  }

  getCategory(budgetId: EntityId, categoryId: EntityId): Observable<CategoryResponse> {
    return this.httpClient.get<CategoryResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/categories/${encodeURIComponent(categoryId)}`),
      this.httpOptions()
    );
  }

  updateCategory(
    budgetId: EntityId,
    categoryId: EntityId,
    payload: CategoryUpdate
  ): Observable<CategoryResponse> {
    return this.httpClient.patch<CategoryResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/categories/${encodeURIComponent(categoryId)}`),
      payload,
      this.httpOptions()
    );
  }

  deleteCategory(
    budgetId: EntityId,
    categoryId: EntityId,
    payload: CategoryDelete
  ): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/categories/${encodeURIComponent(categoryId)}`),
      {
        ...this.httpOptions(),
        body: payload
      }
    );
  }

  createPayee(budgetId: EntityId, payload: PayeeCreate): Observable<PayeeResponse> {
    return this.httpClient.post<PayeeResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/payees`),
      payload,
      this.httpOptions()
    );
  }

  listPayees(budgetId: EntityId): Observable<readonly PayeeResponse[]> {
    return this.httpClient.get<readonly PayeeResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/payees`),
      this.httpOptions()
    );
  }

  getPayee(budgetId: EntityId, payeeId: EntityId): Observable<PayeeResponse> {
    return this.httpClient.get<PayeeResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/payees/${encodeURIComponent(payeeId)}`),
      this.httpOptions()
    );
  }

  updatePayee(
    budgetId: EntityId,
    payeeId: EntityId,
    payload: PayeeUpdate
  ): Observable<PayeeResponse> {
    return this.httpClient.patch<PayeeResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/payees/${encodeURIComponent(payeeId)}`),
      payload,
      this.httpOptions()
    );
  }

  deletePayee(budgetId: EntityId, payeeId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/payees/${encodeURIComponent(payeeId)}`),
      this.httpOptions()
    );
  }

  createTag(budgetId: EntityId, payload: TagCreate): Observable<TagResponse> {
    return this.httpClient.post<TagResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/tags`),
      payload,
      this.httpOptions()
    );
  }

  listTags(budgetId: EntityId): Observable<readonly TagResponse[]> {
    return this.httpClient.get<readonly TagResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/tags`),
      this.httpOptions()
    );
  }

  getTag(budgetId: EntityId, tagId: EntityId): Observable<TagResponse> {
    return this.httpClient.get<TagResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/tags/${encodeURIComponent(tagId)}`),
      this.httpOptions()
    );
  }

  updateTag(budgetId: EntityId, tagId: EntityId, payload: TagUpdate): Observable<TagResponse> {
    return this.httpClient.patch<TagResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/tags/${encodeURIComponent(tagId)}`),
      payload,
      this.httpOptions()
    );
  }

  deleteTag(budgetId: EntityId, tagId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/tags/${encodeURIComponent(tagId)}`),
      this.httpOptions()
    );
  }

  createTransaction(budgetId: EntityId, payload: TransactionCreate): Observable<TransactionResponse> {
    return this.httpClient.post<TransactionResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/transactions`),
      payload,
      this.httpOptions()
    );
  }

  listTransactions(budgetId: EntityId): Observable<readonly TransactionResponse[]> {
    return this.httpClient.get<readonly TransactionResponse[]>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/transactions`),
      this.httpOptions()
    );
  }

  importTransactions(
    budgetId: EntityId,
    payload: TransactionBulkCreate
  ): Observable<TransactionImportSummary> {
    return this.httpClient.post<TransactionImportSummary>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/transactions/import`),
      payload,
      this.httpOptions()
    );
  }

  createTransfer(budgetId: EntityId, payload: TransferCreate): Observable<TransactionResponse> {
    return this.httpClient.post<TransactionResponse>(
      this.url(`/budgets/${encodeURIComponent(budgetId)}/transactions/transfer`),
      payload,
      this.httpOptions()
    );
  }

  getTransaction(budgetId: EntityId, transactionId: EntityId): Observable<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(
      this.url(
        `/budgets/${encodeURIComponent(budgetId)}/transactions/${encodeURIComponent(transactionId)}`
      ),
      this.httpOptions()
    );
  }

  updateTransaction(
    budgetId: EntityId,
    transactionId: EntityId,
    payload: TransactionUpdate
  ): Observable<TransactionResponse> {
    return this.httpClient.patch<TransactionResponse>(
      this.url(
        `/budgets/${encodeURIComponent(budgetId)}/transactions/${encodeURIComponent(transactionId)}`
      ),
      payload,
      this.httpOptions()
    );
  }

  deleteTransaction(budgetId: EntityId, transactionId: EntityId): Observable<void> {
    return this.httpClient.delete<void>(
      this.url(
        `/budgets/${encodeURIComponent(budgetId)}/transactions/${encodeURIComponent(transactionId)}`
      ),
      this.httpOptions()
    );
  }

  splitTransaction(
    budgetId: EntityId,
    transactionId: EntityId,
    payload: TransactionSplitCreate
  ): Observable<TransactionResponse> {
    return this.httpClient.post<TransactionResponse>(
      this.url(
        `/budgets/${encodeURIComponent(budgetId)}/transactions/${encodeURIComponent(transactionId)}/split`
      ),
      payload,
      this.httpOptions()
    );
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private httpOptions(): { headers: HttpHeaders } {
    return {
      headers: this.authHeaders()
    };
  }

  private authHeaders(): HttpHeaders {
    const accessToken = this.oauthService.getAccessToken();
    if (accessToken.trim().length === 0) {
      return new HttpHeaders();
    }

    return new HttpHeaders({
      Authorization: `Bearer ${accessToken}`
    });
  }
}
