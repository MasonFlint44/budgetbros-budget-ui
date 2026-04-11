export type EntityId = string;

export type TransactionStatus =
  | 'pending'
  | 'cleared'
  | 'reconciled'
  | (string & {});

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit'
  | 'investment'
  | (string & {});

export interface BudgetResponse {
  readonly id: EntityId;
  readonly name: string;
  readonly base_currency_code: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface BudgetCreate {
  readonly name: string;
  readonly base_currency_code: string;
  readonly [key: string]: unknown;
}

export interface BudgetUpdate {
  readonly name?: string;
  readonly base_currency_code?: string;
  readonly [key: string]: unknown;
}

export interface BudgetMemberResponse {
  readonly user_id: EntityId;
  readonly budget_id: EntityId;
  readonly role?: string;
  readonly added_at?: string;
  readonly [key: string]: unknown;
}

export interface BudgetMemberCreate {
  readonly user_id: EntityId;
  readonly role?: string;
  readonly [key: string]: unknown;
}

export interface AccountResponse {
  readonly id: EntityId;
  readonly budget_id: EntityId;
  readonly name: string;
  readonly type: AccountType;
  readonly currency_code?: string;
  readonly is_active?: boolean;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface AccountCreate {
  readonly name: string;
  readonly type: AccountType;
  readonly currency_code: string;
  readonly is_active?: boolean;
  readonly [key: string]: unknown;
}

export interface AccountUpdate {
  readonly name?: string;
  readonly type?: AccountType;
  readonly currency_code?: string;
  readonly is_active?: boolean;
  readonly [key: string]: unknown;
}

export interface CategoryResponse {
  readonly id: EntityId;
  readonly budget_id: EntityId;
  readonly name: string;
  readonly sort_order?: number;
  readonly assigned_minor?: number;
  readonly activity_minor?: number;
  readonly available_minor?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface CategoryCreate {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface CategoryUpdate {
  readonly name?: string;
  readonly sort_order?: number;
  readonly [key: string]: unknown;
}

export interface CategoryDelete {
  readonly replacement_category_id: EntityId;
  readonly [key: string]: unknown;
}

export interface PayeeResponse {
  readonly id: EntityId;
  readonly budget_id: EntityId;
  readonly name: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface PayeeCreate {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface PayeeUpdate {
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface TagResponse {
  readonly id: EntityId;
  readonly budget_id: EntityId;
  readonly name: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface TagCreate {
  readonly name: string;
  readonly [key: string]: unknown;
}

export interface TagUpdate {
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface CurrencyResponse {
  readonly code: string;
  readonly name: string;
  readonly symbol?: string;
  readonly [key: string]: unknown;
}

export interface TransactionLineResponse {
  readonly id?: EntityId;
  readonly account_id?: EntityId;
  readonly category_id?: EntityId | null;
  readonly payee_id?: EntityId | null;
  readonly amount_minor: number;
  readonly memo?: string | null;
  readonly [key: string]: unknown;
}

export interface TransactionResponse {
  readonly id: EntityId;
  readonly budget_id: EntityId;
  readonly posted_at?: string;
  readonly status?: TransactionStatus;
  readonly notes?: string | null;
  readonly import_id?: string | null;
  readonly lines?: readonly TransactionLineResponse[] | null;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly [key: string]: unknown;
}

export interface TransactionLineCreate {
  readonly account_id: EntityId;
  readonly category_id?: EntityId | null;
  readonly payee_id?: EntityId | null;
  readonly amount_minor: number;
  readonly memo?: string | null;
  readonly tag_ids?: readonly EntityId[] | null;
  readonly [key: string]: unknown;
}

export interface TransactionCreate {
  readonly posted_at?: string | null;
  readonly status?: TransactionStatus | null;
  readonly notes?: string | null;
  readonly import_id?: string | null;
  readonly line: TransactionLineCreate;
  readonly [key: string]: unknown;
}

export interface TransactionBulkCreate {
  readonly transactions: readonly TransactionCreate[];
  readonly [key: string]: unknown;
}

export interface TransactionUpdate {
  readonly posted_at?: string | null;
  readonly status?: TransactionStatus | null;
  readonly notes?: string | null;
  readonly import_id?: string | null;
  readonly lines?: readonly TransactionLineCreate[] | null;
  readonly [key: string]: unknown;
}

export interface TransferCreate {
  readonly from_account_id: EntityId;
  readonly to_account_id: EntityId;
  readonly amount_minor: number;
  readonly payee_id?: EntityId | null;
  readonly posted_at?: string | null;
  readonly notes?: string | null;
  readonly memo?: string | null;
  readonly tag_ids?: readonly EntityId[] | null;
  readonly [key: string]: unknown;
}

export interface TransactionSplitCreate {
  readonly lines: readonly TransactionLineCreate[];
  readonly [key: string]: unknown;
}

export interface TransactionImportSummary {
  readonly created: number;
  readonly duplicates?: number;
  readonly invalid?: number;
  readonly [key: string]: unknown;
}

export interface UserResponse {
  readonly id: EntityId;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly created_at?: string | null;
  readonly createdAt?: string | null;
  readonly user_create_date?: string | number | null;
  readonly userCreateDate?: string | number | null;
  readonly [key: string]: unknown;
}
