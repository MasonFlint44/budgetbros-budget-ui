import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { BudgetApiService } from '../api/budget-api.service';
import { BudgetResponse, CategoryResponse, CurrencyResponse } from '../api/budget-api.models';
import { BudgetsPageComponent } from './budgets-page.component';

function findCategoryRow(container: HTMLElement, categoryName: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll('tbody tr')).find((row) =>
      row.textContent?.includes(categoryName),
    ) ?? null
  ) as HTMLElement | null;
}

describe('BudgetsPageComponent', () => {
  let budgets: readonly BudgetResponse[];
  let categoriesByBudgetId: Record<string, readonly CategoryResponse[]>;
  let deleteCategoryPayloads: Array<{ budgetId: string; categoryId: string; replacementCategoryId: string }>;

  beforeEach(async () => {
    budgets = [];
    categoriesByBudgetId = {};
    deleteCategoryPayloads = [];

    const budgetApiServiceStub = {
      listBudgets: () => of(budgets),
      listCategories: (budgetId: string) => of(categoriesByBudgetId[budgetId] ?? []),
      updateCategory: (
        budgetId: string,
        categoryId: string,
        payload: { name?: string; sort_order?: number; is_archived?: boolean },
      ) => {
        const nextCategories = (categoriesByBudgetId[budgetId] ?? []).map((category) =>
          category.id === categoryId
            ? {
                ...category,
                name: payload.name ?? category.name,
                sort_order: payload.sort_order ?? category.sort_order,
                is_archived: payload.is_archived ?? (category['is_archived'] as boolean | undefined),
              }
            : category,
        );
        categoriesByBudgetId = {
          ...categoriesByBudgetId,
          [budgetId]: nextCategories,
        };

        return of(
          nextCategories.find((category) => category.id === categoryId) ?? {
            id: categoryId,
            budget_id: budgetId,
            name: payload.name ?? 'Unknown',
            sort_order: payload.sort_order,
          },
        );
      },
      deleteCategory: (
        budgetId: string,
        categoryId: string,
        payload: { replacement_category_id: string },
      ) => {
        deleteCategoryPayloads.push({
          budgetId,
          categoryId,
          replacementCategoryId: payload.replacement_category_id,
        });
        categoriesByBudgetId = {
          ...categoriesByBudgetId,
          [budgetId]: (categoriesByBudgetId[budgetId] ?? []).filter(
            (category) => category.id !== categoryId,
          ),
        };

        return of(void 0);
      },
      listCurrencies: () =>
        of<readonly CurrencyResponse[]>([
          { code: 'USD', name: 'US Dollar' },
          { code: 'EUR', name: 'Euro' },
        ]),
    };

    await TestBed.configureTestingModule({
      imports: [BudgetsPageComponent],
      providers: [{ provide: BudgetApiService, useValue: budgetApiServiceStub }],
    }).compileComponents();
  });

  it('should show the empty budget state when the user has no budgets', async () => {
    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Budgets');
    expect(compiled.textContent).toContain('No budgets yet');
    expect(compiled.textContent).toContain('Create budget');
  });

  it('should show create category actions when a budget has no categories', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const createButtons = Array.from(compiled.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );

    expect(compiled.textContent).toContain('No categories yet');
    expect(createButtons).toContain('Create category');
  });

  it('should render a budget switcher with a create budget action that opens below it', async () => {
    budgets = [
      { id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' },
      { id: 'budget-2', name: 'Travel Budget', base_currency_code: 'EUR' },
    ];

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const switcherButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Home Budget'),
    );

    expect(switcherButton?.textContent).toContain('Currency: USD');

    switcherButton?.click();
    fixture.detectChanges();

    const menuButtons = Array.from(compiled.querySelectorAll('[role="menuitem"]')).map((element) =>
      element.textContent?.trim(),
    );

    expect(menuButtons).toContain('Home BudgetUSD');
    expect(menuButtons).toContain('Travel BudgetEUR');
    expect(menuButtons).toContain('Create budget▾');
  });

  it('should render a categories table when the selected budget has categories', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        {
          id: 'category-1',
          budget_id: 'budget-1',
          name: 'Groceries',
          assigned_minor: 12500,
          activity_minor: -4200,
          available_minor: 8300,
        },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const headers = Array.from(compiled.querySelectorAll('thead th')).map((header) =>
      header.textContent?.trim(),
    );

    expect(headers).toEqual(['Order', 'Category', 'Assigned', 'Activity', 'Available']);
    expect(compiled.textContent).toContain('Groceries');
    expect(compiled.textContent).toContain('$125.00');
    expect(compiled.textContent).toContain('-$42.00');
    expect(compiled.textContent).toContain('$83.00');
    expect(compiled.textContent).not.toContain('No categories yet');
    expect(compiled.textContent).not.toContain('Drag rows to reorder categories.');
  });

  it('should open the edit category dropdown directly on right click', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Dining Out' },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = findCategoryRow(compiled, 'Groceries');

    row?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"][aria-label="Edit category"]');

    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Edit category');
    expect(dialog?.textContent).toContain('Delete');
  });

  it('should let the user rename a category from the edit dropdown', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Dining Out' },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = findCategoryRow(compiled, 'Groceries');

    row?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"][aria-label="Edit category"]');
    const input = dialog?.querySelector('#edit-category-name') as HTMLInputElement | null;
    input!.value = 'Food';
    input?.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (dialog?.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.textContent).toContain('Food');
    expect(compiled.textContent).not.toContain('Groceries');
  });

  it('should let the user archive a category from the edit dropdown', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Dining Out' },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = findCategoryRow(compiled, 'Groceries');

    row?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"][aria-label="Edit category"]');
    const archiveButton = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Archive',
    ) as HTMLButtonElement | undefined;
    archiveButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.textContent).toContain('Dining Out');
    expect(compiled.textContent).not.toContain('Groceries');
  });

  it('should keep archived categories hidden until the user chooses to view them', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Old Dining', is_archived: true },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Groceries');
    expect(compiled.textContent).not.toContain('Old Dining');

    const archivedCategoriesButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Archived categories (1)'),
    ) as HTMLButtonElement | undefined;

    expect(archivedCategoriesButton?.getAttribute('aria-expanded')).toBe('false');

    archivedCategoriesButton?.click();
    fixture.detectChanges();

    expect(archivedCategoriesButton?.getAttribute('aria-expanded')).toBe('true');
    expect(compiled.textContent).toContain('Archived categories');
    expect(compiled.textContent).toContain('Old Dining');
    expect(compiled.textContent).toContain('Archived');
  });

  it('should show a confirmation popover before deleting a category', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Dining Out' },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = findCategoryRow(compiled, 'Groceries');

    row?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"][aria-label="Edit category"]');
    const deleteButton = Array.from(dialog?.querySelectorAll('button') ?? []).find((element) =>
      element.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement | undefined;
    deleteButton?.click();
    fixture.detectChanges();

    const confirmation = compiled.querySelector(
      '[role="alertdialog"][aria-label="Confirm delete category"]',
    );

    expect(confirmation).not.toBeNull();
    expect(confirmation?.textContent).toContain('Delete Groceries?');
    expect(confirmation?.textContent).toContain('transactions, assigned balance, and available balance');
    expect(confirmation?.textContent).toContain('Move everything to');
    expect(confirmation?.textContent).toContain('Dining Out');
    expect(confirmation?.textContent).toContain('Delete category');
  });

  it('should let the user delete a category from the confirmation popover', async () => {
    budgets = [{ id: 'budget-1', name: 'Home Budget', base_currency_code: 'USD' }];
    categoriesByBudgetId = {
      'budget-1': [
        { id: 'category-1', budget_id: 'budget-1', name: 'Groceries' },
        { id: 'category-2', budget_id: 'budget-1', name: 'Dining Out' },
      ],
    };

    const fixture = TestBed.createComponent(BudgetsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const row = findCategoryRow(compiled, 'Groceries');

    row?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 80,
      }),
    );
    fixture.detectChanges();

    const dialog = compiled.querySelector('[role="dialog"][aria-label="Edit category"]');
    const revealDeleteButton = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement | undefined;
    revealDeleteButton?.click();
    fixture.detectChanges();

    const confirmation = compiled.querySelector(
      '[role="alertdialog"][aria-label="Confirm delete category"]',
    );
    const replacementSelect = confirmation?.querySelector(
      '#delete-category-replacement',
    ) as HTMLSelectElement | null;
    replacementSelect!.value = 'category-2';
    replacementSelect?.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const confirmDeleteButton = Array.from(confirmation?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.includes('Delete category'),
    ) as HTMLButtonElement | undefined;
    confirmDeleteButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(deleteCategoryPayloads).toEqual([
      {
        budgetId: 'budget-1',
        categoryId: 'category-1',
        replacementCategoryId: 'category-2',
      },
    ]);
    expect(compiled.textContent).toContain('Dining Out');
    expect(compiled.textContent).not.toContain('Groceries');
  });
});
