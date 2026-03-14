import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  viewChild
} from '@angular/core';

@Component({
  selector: 'app-money-countdown-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #rowElement
      [class]="rowClass()"
      (mouseenter)="replayCountdownOnHover()"
    >
      @if (!compact()) {
        <div class="min-w-0 shrink">
          <p class="truncate text-[10px] font-medium leading-tight">{{ label() }}</p>
        </div>
      }

      <p class="sr-only">{{ label() }} amount is {{ formattedAmount() }}</p>
      <div aria-hidden="true" class="flex shrink-0 items-end font-mono text-xs leading-none">
        @if (isNegative()) {
          <span class="inline-flex items-center justify-center px-0.5 py-px text-xs leading-none opacity-80">
            -
          </span>
        }
        <span
          class="inline-flex items-center justify-center translate-y-px px-0.5 py-px text-xs leading-none opacity-80"
        >
          {{ currencySymbol() }}
        </span>
        @for (digit of dollarsDigits(); track $index) {
          <span
            class="countdown overflow-hidden text-xs"
            [style.width]="dollarsVisible()[$index] ? null : '0ch'"
            [style.opacity]="dollarsVisible()[$index] ? 1 : 0"
          >
            <span [style.--value]="digit" [attr.data-countdown-target]="digit">
              {{ digit }}
            </span>
          </span>
        }
        <span class="mx-0.5 text-[10px] opacity-70">.</span>
        <span class="countdown text-xs text-primary">
          <span
            [style.--value]="centsValue()"
            [style.--digits]="2"
            [attr.data-countdown-target]="centsValue()"
          >
            {{ centsText() }}
          </span>
        </span>
      </div>
    </div>
  `
})
export class MoneyCountdownRowComponent implements OnDestroy {
  readonly label = input.required<string>();
  readonly amountInCents = input.required<number>();
  readonly currencyCode = input('USD');
  readonly compact = input(false);
  readonly dollarsDigitsCount = input(1);
  readonly hoverToZeroDelayMs = input(650);

  private readonly rowElement = viewChild<ElementRef<HTMLElement>>('rowElement');
  private readonly currencyFormatters = new Map<string, Intl.NumberFormat>();
  private hoverReplayTimeoutId?: ReturnType<typeof setTimeout>;

  private readonly roundedAmountInCents = computed(() => Math.trunc(this.amountInCents()));
  protected readonly isNegative = computed(() => this.roundedAmountInCents() < 0);
  private readonly normalizedAmountInCents = computed(() => Math.abs(this.roundedAmountInCents()));
  protected readonly rowClass = computed(() =>
    this.compact()
      ? 'inline-flex items-center justify-end whitespace-nowrap'
      : 'flex items-center justify-between gap-1 rounded-box border border-base-300 px-1.5 py-1'
  );
  protected readonly dollarsDigits = computed(() => {
    const dollars = Math.floor(this.normalizedAmountInCents() / 100);

    return dollars
      .toString()
      .padStart(this.dollarsDigitsCount(), '0')
      .split('')
      .map((digit) => Number(digit));
  });
  protected readonly dollarsVisible = computed(() => {
    const digits = this.dollarsDigits();
    const firstSignificantDollarIndex = digits.findIndex((digit) => digit !== 0);
    const visibleFromIndex =
      firstSignificantDollarIndex === -1 ? digits.length - 1 : firstSignificantDollarIndex;

    return digits.map((_, index) => index >= visibleFromIndex);
  });
  protected readonly currencySymbol = computed(() => {
    const parts = this.getCurrencyFormatter().formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? '$';
  });
  protected readonly centsValue = computed(() => this.normalizedAmountInCents() % 100);
  protected readonly centsText = computed(() => this.centsValue().toString().padStart(2, '0'));
  protected readonly formattedAmount = computed(() =>
    this.getCurrencyFormatter().format(this.roundedAmountInCents() / 100)
  );

  ngOnDestroy(): void {
    this.clearHoverReplayTimeout();
  }

  protected replayCountdownOnHover(): void {
    if (this.normalizedAmountInCents() === 0) {
      return;
    }

    this.clearHoverReplayTimeout();

    const countdownValueElements = this.rowElement()
      ?.nativeElement.querySelectorAll<HTMLElement>('[data-countdown-target]');
    if (countdownValueElements === undefined || countdownValueElements.length === 0) {
      return;
    }

    countdownValueElements.forEach((element) => {
      element.style.setProperty('--value', '0');
    });

    this.hoverReplayTimeoutId = setTimeout(() => {
      countdownValueElements.forEach((element) => {
        const target = element.dataset['countdownTarget'];
        if (target !== undefined) {
          element.style.setProperty('--value', target);
        }
      });

      this.hoverReplayTimeoutId = undefined;
    }, this.hoverToZeroDelayMs());
  }

  private clearHoverReplayTimeout(): void {
    if (this.hoverReplayTimeoutId === undefined) {
      return;
    }

    clearTimeout(this.hoverReplayTimeoutId);
    this.hoverReplayTimeoutId = undefined;
  }

  private getCurrencyFormatter(): Intl.NumberFormat {
    const normalizedCurrencyCode = this.currencyCode().trim().toUpperCase() || 'USD';
    const existingFormatter = this.currencyFormatters.get(normalizedCurrencyCode);
    if (existingFormatter !== undefined) {
      return existingFormatter;
    }

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrencyCode
    });
    this.currencyFormatters.set(normalizedCurrencyCode, formatter);
    return formatter;
  }
}
