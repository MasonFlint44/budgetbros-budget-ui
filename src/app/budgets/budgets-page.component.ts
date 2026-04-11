import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { BudgetApiService } from '../api/budget-api.service';
import { BudgetResponse, CategoryResponse, CurrencyResponse } from '../api/budget-api.models';

type BudgetFormModel = {
  readonly name: FormControl<string>;
  readonly baseCurrencyCode: FormControl<string>;
};

type CategoryFormModel = {
  readonly name: FormControl<string>;
};

type CategoryDeleteFormModel = {
  readonly replacementCategoryId: FormControl<string>;
};

@Component({
  selector: 'app-budgets-page',
  imports: [ReactiveFormsModule],
  templateUrl: './budgets-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'handleDocumentClick($event)',
    '(document:contextmenu)': 'handleDocumentContextMenu($event)',
    '(document:keydown.escape)': 'closeTransientCategoryUi()',
  },
})
export class BudgetsPageComponent implements OnInit, OnDestroy {
  private readonly budgetApiService = inject(BudgetApiService);
  private readonly minimumLoadingIndicatorDurationInMs = 1000;
  private readonly budgetSwitcherDropdown =
    viewChild<ElementRef<HTMLDivElement>>('budgetSwitcherDropdown');
  private readonly createBudgetDropdown =
    viewChild<ElementRef<HTMLDivElement>>('createBudgetDropdown');
  private readonly createCategoryDropdown =
    viewChild<ElementRef<HTMLDivElement>>('createCategoryDropdown');
  private readonly archivedCategoriesDropdown =
    viewChild<ElementRef<HTMLDivElement>>('archivedCategoriesDropdown');
  private readonly editCategoryDropdown =
    viewChild<ElementRef<HTMLDivElement>>('editCategoryDropdown');
  private loadingRequestCount = 0;
  private loadingIndicatorStartedAt = 0;
  private loadingIndicatorTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly dataChanged = output<void>();

  protected readonly budgets = signal<readonly BudgetResponse[]>([]);
  protected readonly categories = signal<readonly CategoryResponse[]>([]);
  protected readonly archivedCategories = signal<readonly CategoryResponse[]>([]);
  protected readonly currencies = signal<readonly CurrencyResponse[]>([]);
  protected readonly budgetsLoading = signal(false);
  protected readonly budgetsError = signal<string | null>(null);
  protected readonly categoriesLoading = signal(false);
  protected readonly categoriesError = signal<string | null>(null);
  protected readonly budgetSubmitError = signal<string | null>(null);
  protected readonly categorySubmitError = signal<string | null>(null);
  protected readonly budgetSubmitting = signal(false);
  protected readonly categorySubmitting = signal(false);
  protected readonly budgetSwitcherOpen = signal(false);
  protected readonly createBudgetFormVisible = signal(false);
  protected readonly createCategoryFormVisible = signal(false);
  protected readonly archivedCategoriesVisible = signal(false);
  protected readonly pageLoadingIndicatorVisible = signal(false);
  protected readonly selectedBudgetId = signal<string | null>(null);
  protected readonly draggingCategoryId = signal<string | null>(null);
  protected readonly reorderPending = signal(false);
  protected readonly editingCategoryId = signal<string | null>(null);
  protected readonly editCategoryPosition = signal<{ readonly x: number; readonly y: number } | null>(
    null,
  );
  protected readonly deleteCategoryConfirmationVisible = signal(false);
  protected readonly categoryActionPending = signal(false);

  protected readonly budgetForm = new FormGroup<BudgetFormModel>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    baseCurrencyCode: new FormControl('USD', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(3),
        Validators.pattern(/^[A-Za-z]{3}$/),
      ],
    }),
  });

  protected readonly categoryForm = new FormGroup<CategoryFormModel>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
  });

  protected readonly editCategoryForm = new FormGroup<CategoryFormModel>({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
  });

  protected readonly deleteCategoryForm = new FormGroup<CategoryDeleteFormModel>({
    replacementCategoryId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected readonly activeBudget = computed(
    () => this.budgets().find((budget) => budget.id === this.selectedBudgetId()) ?? null,
  );
  protected readonly hasBudgets = computed(() => this.budgets().length > 0);
  protected readonly hasCategories = computed(() => this.categories().length > 0);
  protected readonly hasArchivedCategories = computed(() => this.archivedCategories().length > 0);
  protected readonly showNoBudgetsState = computed(
    () => !this.budgetsLoading() && this.budgetsError() === null && !this.hasBudgets(),
  );
  protected readonly showNoCategoriesState = computed(
    () =>
      this.activeBudget() !== null &&
      !this.categoriesLoading() &&
      this.categoriesError() === null &&
      !this.hasCategories(),
  );
  protected readonly reorderingDisabled = computed(
    () =>
      this.categoriesLoading() ||
      this.categorySubmitting() ||
      this.reorderPending() ||
      this.categoryActionPending(),
  );
  protected readonly editingCategory = computed(
    () => this.categories().find((category) => category.id === this.editingCategoryId()) ?? null,
  );
  protected readonly deleteCategoryOptions = computed(() => {
    const editingCategoryId = this.editingCategoryId();
    if (editingCategoryId === null) {
      return [];
    }

    return this.categories().filter((category) => category.id !== editingCategoryId);
  });

  protected toggleArchivedCategoriesVisibility(): void {
    if (!this.hasArchivedCategories()) {
      return;
    }

    this.archivedCategoriesVisible.update((isVisible) => !isVisible);
  }

  ngOnInit(): void {
    void this.loadCurrencies();
    void this.loadBudgets();
  }

  ngOnDestroy(): void {
    this.clearLoadingIndicatorTimeout();
  }

  protected selectBudget(budgetId: string): void {
    if (budgetId === this.selectedBudgetId()) {
      this.createBudgetFormVisible.set(false);
      this.budgetSwitcherOpen.set(false);
      return;
    }

    this.selectedBudgetId.set(budgetId);
    this.createBudgetFormVisible.set(false);
    this.budgetSwitcherOpen.set(false);
    this.categories.set([]);
    this.archivedCategories.set([]);
    this.archivedCategoriesVisible.set(false);
    this.categoriesError.set(null);
    void this.loadCategories(budgetId);
  }

  protected toggleBudgetSwitcher(): void {
    if (!this.hasBudgets()) {
      return;
    }

    this.budgetSwitcherOpen.update((isOpen) => {
      if (isOpen) {
        this.createBudgetFormVisible.set(false);
      }

      return !isOpen;
    });
  }

  protected handleCategoryDragStart(event: DragEvent, categoryId: string): void {
    if (this.reorderingDisabled()) {
      event.preventDefault();
      return;
    }

    event.dataTransfer?.setData('text/plain', categoryId);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move';
    }

    this.draggingCategoryId.set(categoryId);
  }

  protected handleCategoryDragEnd(): void {
    this.draggingCategoryId.set(null);
  }

  protected allowCategoryDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  protected handleCategoryDrop(targetCategoryId: string): void {
    const draggedCategoryId = this.draggingCategoryId();
    if (
      draggedCategoryId === null ||
      draggedCategoryId === targetCategoryId ||
      this.reorderingDisabled()
    ) {
      this.draggingCategoryId.set(null);
      return;
    }

    void this.reorderCategories(draggedCategoryId, targetCategoryId);
  }

  protected isDraggingCategory(categoryId: string): boolean {
    return this.draggingCategoryId() === categoryId;
  }

  protected showCreateBudgetForm(): void {
    this.budgetSwitcherOpen.set(true);
    this.createBudgetFormVisible.set(true);
    this.budgetSubmitError.set(null);
  }

  protected toggleCreateBudgetForm(): void {
    if (this.createBudgetFormVisible()) {
      this.hideCreateBudgetForm();
      return;
    }

    this.showCreateBudgetForm();
  }

  protected hideCreateBudgetForm(): void {
    this.createBudgetFormVisible.set(false);
    this.budgetSubmitError.set(null);
    this.budgetForm.reset({
      name: '',
      baseCurrencyCode: this.defaultCurrencyCode(),
    });
  }

  protected showCreateCategoryForm(): void {
    if (this.activeBudget() === null) {
      return;
    }

    this.createCategoryFormVisible.set(true);
    this.categorySubmitError.set(null);
  }

  protected hideCreateCategoryForm(): void {
    this.createCategoryFormVisible.set(false);
    this.categorySubmitError.set(null);
    this.categoryForm.reset({ name: '' });
  }

  protected openCategoryContextMenu(event: MouseEvent, category: CategoryResponse): void {
    event.preventDefault();

    if (this.reorderingDisabled()) {
      this.closeTransientCategoryUi();
      return;
    }

    this.editCategoryForm.reset({ name: category.name });
    this.editCategoryPosition.set(
      { x: event.clientX, y: event.clientY },
    );
    this.editingCategoryId.set(category.id);
    this.deleteCategoryConfirmationVisible.set(false);
    this.deleteCategoryForm.reset({ replacementCategoryId: '' });
    this.categorySubmitError.set(null);
  }

  protected cancelEditingCategory(): void {
    this.editingCategoryId.set(null);
    this.editCategoryPosition.set(null);
    this.deleteCategoryConfirmationVisible.set(false);
    this.deleteCategoryForm.reset({ replacementCategoryId: '' });
    this.categorySubmitError.set(null);
    this.editCategoryForm.reset({ name: '' });
  }

  protected showDeleteCategoryConfirmation(): void {
    if (this.editingCategory() === null || this.categoryActionPending()) {
      return;
    }

    this.deleteCategoryConfirmationVisible.set(true);
    this.deleteCategoryForm.reset({ replacementCategoryId: '' });
    this.categorySubmitError.set(null);
  }

  protected hideDeleteCategoryConfirmation(): void {
    this.deleteCategoryConfirmationVisible.set(false);
    this.deleteCategoryForm.reset({ replacementCategoryId: '' });
  }

  protected async archiveCategory(): Promise<void> {
    const budget = this.activeBudget();
    const category = this.editingCategory();
    if (budget === null || category === null || this.categoryActionPending()) {
      return;
    }

    this.categoryActionPending.set(true);
    this.deleteCategoryConfirmationVisible.set(false);
    this.categorySubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.updateCategory(budget.id, category.id, {
          is_archived: true,
        }),
      );

      this.cancelEditingCategory();
      await this.loadCategories(budget.id);
      this.dataChanged.emit();
    } catch (error) {
      this.categorySubmitError.set(
        this.mapError(error, 'Could not archive the category right now.'),
      );
    } finally {
      this.categoryActionPending.set(false);
    }
  }

  protected async saveCategoryEdit(): Promise<void> {
    const budget = this.activeBudget();
    const category = this.editingCategory();
    if (budget === null || category === null || this.categoryActionPending()) {
      return;
    }

    if (this.editCategoryForm.invalid) {
      this.editCategoryForm.markAllAsTouched();
      return;
    }

    const nextName = this.editCategoryForm.controls.name.getRawValue().trim();
    if (nextName === category.name) {
      this.cancelEditingCategory();
      return;
    }

    this.categoryActionPending.set(true);
    this.categorySubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.updateCategory(budget.id, category.id, {
          name: nextName,
        }),
      );

      await this.loadCategories(budget.id);
      this.cancelEditingCategory();
      this.dataChanged.emit();
    } catch (error) {
      this.categorySubmitError.set(
        this.mapError(error, 'Could not update the category right now.'),
      );
    } finally {
      this.categoryActionPending.set(false);
    }
  }

  protected async confirmCategoryDelete(): Promise<void> {
    const budget = this.activeBudget();
    const category = this.editingCategory();
    if (budget === null || category === null || this.categoryActionPending()) {
      return;
    }

    if (this.deleteCategoryForm.invalid) {
      this.deleteCategoryForm.markAllAsTouched();
      return;
    }

    const replacementCategoryId = this.deleteCategoryForm.controls.replacementCategoryId
      .getRawValue()
      .trim();

    this.categoryActionPending.set(true);
    this.categorySubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.deleteCategory(budget.id, category.id, {
          replacement_category_id: replacementCategoryId,
        }),
      );
      this.cancelEditingCategory();
      await this.loadCategories(budget.id);
      this.dataChanged.emit();
    } catch (error) {
      this.deleteCategoryConfirmationVisible.set(true);
      this.categorySubmitError.set(
        this.mapError(error, 'Could not delete the category right now.'),
      );
    } finally {
      this.categoryActionPending.set(false);
    }
  }

  protected handleDocumentClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const budgetSwitcher = this.budgetSwitcherDropdown()?.nativeElement;
    const createBudgetDropdown = this.createBudgetDropdown()?.nativeElement;
    const clickIsInsideCreateBudget =
      createBudgetDropdown !== undefined && createBudgetDropdown.contains(target);
    if (
      this.budgetSwitcherOpen() &&
      budgetSwitcher !== undefined &&
      !budgetSwitcher.contains(target) &&
      !clickIsInsideCreateBudget
    ) {
      this.createBudgetFormVisible.set(false);
      this.budgetSwitcherOpen.set(false);
    }

    if (
      this.createBudgetFormVisible() &&
      createBudgetDropdown !== undefined &&
      !createBudgetDropdown.contains(target)
    ) {
      this.hideCreateBudgetForm();
    }

    const categoryDropdown = this.createCategoryDropdown()?.nativeElement;
    if (
      this.createCategoryFormVisible() &&
      categoryDropdown !== undefined &&
      !categoryDropdown.contains(target)
    ) {
      this.hideCreateCategoryForm();
    }

    const archivedCategoriesDropdown = this.archivedCategoriesDropdown()?.nativeElement;
    if (
      this.archivedCategoriesVisible() &&
      archivedCategoriesDropdown !== undefined &&
      !archivedCategoriesDropdown.contains(target)
    ) {
      this.archivedCategoriesVisible.set(false);
    }

    const editCategoryDropdown = this.editCategoryDropdown()?.nativeElement;
    if (
      this.editingCategoryId() !== null &&
      editCategoryDropdown !== undefined &&
      !editCategoryDropdown.contains(target)
    ) {
      this.cancelEditingCategory();
    }
  }

  protected handleDocumentContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.closeTransientCategoryUi();
      return;
    }

    const editCategoryDropdown = this.editCategoryDropdown()?.nativeElement;
    if (
      (editCategoryDropdown !== undefined && editCategoryDropdown.contains(target)) ||
      (target instanceof HTMLElement &&
        target.closest('[data-category-context-target="true"]') !== null)
    ) {
      return;
    }

    this.closeTransientCategoryUi();
  }

  protected closeTransientCategoryUi(): void {
    this.archivedCategoriesVisible.set(false);
    this.cancelEditingCategory();
  }

  protected async createBudget(): Promise<void> {
    if (this.budgetSubmitting()) {
      return;
    }

    if (this.budgetForm.invalid) {
      this.budgetForm.markAllAsTouched();
      return;
    }

    this.budgetSubmitting.set(true);
    this.budgetSubmitError.set(null);

    try {
      const createdBudget = await firstValueFrom(
        this.budgetApiService.createBudget({
          name: this.budgetForm.controls.name.getRawValue().trim(),
          base_currency_code: this.budgetForm.controls.baseCurrencyCode
            .getRawValue()
            .trim()
            .toUpperCase(),
        }),
      );

      this.hideCreateBudgetForm();
      await this.loadBudgets(createdBudget.id);
      this.dataChanged.emit();
    } catch (error) {
      this.budgetSubmitError.set(this.mapError(error, 'Could not create the budget right now.'));
    } finally {
      this.budgetSubmitting.set(false);
    }
  }

  protected async createCategory(): Promise<void> {
    const budget = this.activeBudget();
    if (budget === null || this.categorySubmitting()) {
      return;
    }

    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.categorySubmitting.set(true);
    this.categorySubmitError.set(null);

    try {
      await firstValueFrom(
        this.budgetApiService.createCategory(budget.id, {
          name: this.categoryForm.controls.name.getRawValue().trim(),
        }),
      );

      this.hideCreateCategoryForm();
      await this.loadCategories(budget.id);
      this.dataChanged.emit();
    } catch (error) {
      this.categorySubmitError.set(
        this.mapError(error, 'Could not create the category right now.'),
      );
    } finally {
      this.categorySubmitting.set(false);
    }
  }

  protected formatDate(value: string | undefined): string {
    if (value === undefined) {
      return 'Not available';
    }

    const parsedTimestamp = Date.parse(value);
    if (Number.isNaN(parsedTimestamp)) {
      return 'Not available';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(parsedTimestamp));
  }

  protected assignedAmountInCents(category: CategoryResponse): number {
    return this.readCategoryAmountInCents(category, [
      'assigned_minor',
      'assigned_in_cents',
      'assigned_cents',
      'assigned',
    ]);
  }

  protected activityAmountInCents(category: CategoryResponse): number {
    return this.readCategoryAmountInCents(category, [
      'activity_minor',
      'activity_in_cents',
      'activity_cents',
      'activity',
    ]);
  }

  protected availableAmountInCents(category: CategoryResponse): number {
    return this.readCategoryAmountInCents(category, [
      'available_minor',
      'available_in_cents',
      'available_cents',
      'available',
    ]);
  }

  protected formatCurrencyAmount(amountInCents: number, currencyCode: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode.trim().toUpperCase() || 'USD',
    }).format(amountInCents / 100);
  }

  private async loadCurrencies(): Promise<void> {
    try {
      const currencies = await firstValueFrom(this.budgetApiService.listCurrencies());
      this.currencies.set(currencies);

      const defaultCurrencyCode = this.defaultCurrencyCode();
      if (this.budgetForm.controls.baseCurrencyCode.pristine) {
        this.budgetForm.controls.baseCurrencyCode.setValue(defaultCurrencyCode);
      }
    } catch {
      this.currencies.set([]);
    }
  }

  private async loadBudgets(preferredBudgetId: string | null = null): Promise<void> {
    this.beginPageLoading();
    this.budgetsLoading.set(true);
    this.budgetsError.set(null);

    try {
      const budgets = await firstValueFrom(this.budgetApiService.listBudgets());
      this.budgets.set(budgets);

      if (budgets.length === 0) {
        this.budgetSwitcherOpen.set(false);
        this.createBudgetFormVisible.set(false);
        this.selectedBudgetId.set(null);
        this.categories.set([]);
        this.archivedCategories.set([]);
        this.archivedCategoriesVisible.set(false);
        this.categoriesError.set(null);
        this.createCategoryFormVisible.set(false);
        return;
      }

      const nextBudgetId = this.resolveBudgetSelection(budgets, preferredBudgetId);
      this.selectedBudgetId.set(nextBudgetId);
      await this.loadCategories(nextBudgetId);
    } catch (error) {
      this.budgets.set([]);
      this.budgetSwitcherOpen.set(false);
      this.createBudgetFormVisible.set(false);
      this.selectedBudgetId.set(null);
      this.categories.set([]);
      this.archivedCategories.set([]);
      this.archivedCategoriesVisible.set(false);
      this.budgetsError.set(this.mapError(error, 'Could not load your budgets right now.'));
    } finally {
      this.budgetsLoading.set(false);
      this.endPageLoading();
    }
  }

  private async loadCategories(budgetId: string): Promise<void> {
    this.beginPageLoading();
    this.categoriesLoading.set(true);
    this.categoriesError.set(null);

    try {
      const categories = await firstValueFrom(this.budgetApiService.listCategories(budgetId));
      this.categories.set(
        this.sortCategories(categories.filter((category) => !this.isCategoryArchived(category))),
      );
      this.archivedCategories.set(
        this.sortCategories(categories.filter((category) => this.isCategoryArchived(category))),
      );
    } catch (error) {
      this.categories.set([]);
      this.archivedCategories.set([]);
      this.archivedCategoriesVisible.set(false);
      this.categoriesError.set(this.mapError(error, 'Could not load categories right now.'));
    } finally {
      this.categoriesLoading.set(false);
      this.endPageLoading();
    }
  }

  private beginPageLoading(): void {
    this.loadingRequestCount += 1;

    if (this.loadingRequestCount > 1) {
      return;
    }

    this.clearLoadingIndicatorTimeout();
    this.loadingIndicatorStartedAt = Date.now();
    this.pageLoadingIndicatorVisible.set(true);
  }

  private endPageLoading(): void {
    this.loadingRequestCount = Math.max(0, this.loadingRequestCount - 1);
    if (this.loadingRequestCount > 0) {
      return;
    }

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
    if (this.loadingIndicatorTimeoutId === null) {
      return;
    }

    clearTimeout(this.loadingIndicatorTimeoutId);
    this.loadingIndicatorTimeoutId = null;
  }

  private resolveBudgetSelection(
    budgets: readonly BudgetResponse[],
    preferredBudgetId: string | null,
  ): string {
    if (preferredBudgetId !== null && budgets.some((budget) => budget.id === preferredBudgetId)) {
      return preferredBudgetId;
    }

    const currentBudgetId = this.selectedBudgetId();
    if (currentBudgetId !== null && budgets.some((budget) => budget.id === currentBudgetId)) {
      return currentBudgetId;
    }

    return budgets[0].id;
  }

  private defaultCurrencyCode(): string {
    return this.currencies().find((currency) => currency.code === 'USD')?.code ?? 'USD';
  }

  private readCategoryAmountInCents(category: CategoryResponse, keys: readonly string[]): number {
    for (const key of keys) {
      const candidate = category[key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return Math.trunc(candidate);
      }
    }

    return 0;
  }

  private async reorderCategories(
    draggedCategoryId: string,
    targetCategoryId: string,
  ): Promise<void> {
    const currentCategories = this.categories();
    const fromIndex = currentCategories.findIndex((category) => category.id === draggedCategoryId);
    const toIndex = currentCategories.findIndex((category) => category.id === targetCategoryId);
    if (fromIndex < 0 || toIndex < 0) {
      this.draggingCategoryId.set(null);
      return;
    }

    await this.reorderCategoriesByIndex(fromIndex, toIndex);
    this.draggingCategoryId.set(null);
  }

  private async reorderCategoriesByIndex(fromIndex: number, toIndex: number): Promise<void> {
    const budget = this.activeBudget();
    if (budget === null || fromIndex === toIndex) {
      return;
    }

    const previousCategories = this.categories();
    const reorderedCategories = this.moveItem(previousCategories, fromIndex, toIndex);
    this.categories.set(reorderedCategories);
    this.categoriesError.set(null);
    this.reorderPending.set(true);

    try {
      await Promise.all(
        reorderedCategories.map((category, index) =>
          firstValueFrom(
            this.budgetApiService.updateCategory(budget.id, category.id, {
              sort_order: index,
            }),
          ),
        ),
      );

      this.categories.set(
        reorderedCategories.map((category, index) => ({
          ...category,
          sort_order: index,
        })),
      );
    } catch (error) {
      this.categories.set(previousCategories);
      this.categoriesError.set(this.mapError(error, 'Could not save category order right now.'));
    } finally {
      this.reorderPending.set(false);
    }
  }

  private moveItem(
    categories: readonly CategoryResponse[],
    fromIndex: number,
    toIndex: number,
  ): readonly CategoryResponse[] {
    const reorderedCategories = [...categories];
    const [movedCategory] = reorderedCategories.splice(fromIndex, 1);
    reorderedCategories.splice(toIndex, 0, movedCategory);
    return reorderedCategories;
  }

  private sortCategories(categories: readonly CategoryResponse[]): readonly CategoryResponse[] {
    return [...categories].sort((left, right) => {
      const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    });
  }

  private isCategoryArchived(category: CategoryResponse): boolean {
    return category['is_archived'] === true;
  }

  private mapError(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const responseMessage = this.readResponseMessage(error.error);
      if (responseMessage !== null) {
        return responseMessage;
      }
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
