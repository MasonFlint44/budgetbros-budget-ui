import { Directive, ElementRef, OnDestroy, afterNextRender, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Instance } from 'flatpickr/dist/types/instance';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Directive({
  selector: 'input[appDatepicker]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatepickerDirective),
      multi: true,
    },
  ],
})
export class DatepickerDirective implements OnDestroy, ControlValueAccessor {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private fp: Instance | null = null;
  private monthMenu: HTMLElement | null = null;
  private pendingValue: string | null = null;
  private monthMenuCloseHandler: (() => void) | null = null;
  private monthNavSyncHandler: (() => void) | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    afterNextRender(() => {
      const themeHost =
        this.el.nativeElement.closest<HTMLElement>('[data-theme]') ?? document.body;

      this.fp = flatpickr(this.el.nativeElement, {
        dateFormat: 'Y-m-d',
        allowInput: true,
        disableMobile: true,
        appendTo: themeHost,
        onChange: (_dates, dateStr) => {
          this.onChange(dateStr);
        },
        onClose: () => {
          this.onTouched();
        },
      }) as Instance;

      if (this.pendingValue !== null) {
        this.fp.setDate(this.pendingValue, false);
        this.pendingValue = null;
      }

      // Run after the current call stack so flatpickr has finished
      // appending the calendar to the DOM before we manipulate it.
      setTimeout(() => {
        if (this.fp) this.setupCustomMonthDropdown(this.fp, themeHost);
      }, 0);
    });
  }

  ngOnDestroy(): void {
    if (this.monthMenuCloseHandler) {
      document.removeEventListener('click', this.monthMenuCloseHandler);
    }
    if (this.monthNavSyncHandler && this.fp) {
      this.fp.calendarContainer
        .querySelectorAll('.flatpickr-prev-month, .flatpickr-next-month')
        .forEach((btn) => btn.removeEventListener('click', this.monthNavSyncHandler!));
    }
    this.monthMenu?.remove();
    this.fp?.destroy();
  }

  writeValue(value: string | null): void {
    if (this.fp) {
      this.fp.setDate(value ?? '', false);
    } else {
      this.pendingValue = value;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  private setupCustomMonthDropdown(fp: Instance, themeHost: HTMLElement): void {
    const nativeSelect = fp.calendarContainer.querySelector<HTMLSelectElement>(
      '.flatpickr-monthDropdown-months',
    );
    if (!nativeSelect) return;

    // Keep the native select in the DOM (flatpickr still references it
    // internally) but hide it visually.
    nativeSelect.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'fp-month';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'fp-month__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.textContent = MONTH_NAMES[fp.currentMonth];

    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2.5');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('stroke-linejoin', 'round');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.classList.add('fp-month__chevron');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 9l6 6 6-6');
    chevron.appendChild(path);

    trigger.appendChild(label);
    trigger.appendChild(chevron);

    // Append the menu to <body> so it escapes every overflow:hidden, transform,
    // and stacking-context ancestor inside the flatpickr calendar. Copy
    // data-theme so CSS variables resolve correctly.
    const menu = document.createElement('div');
    menu.className = 'fp-month__menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    const theme = themeHost.getAttribute('data-theme');
    if (theme) menu.setAttribute('data-theme', theme);
    document.body.appendChild(menu);
    this.monthMenu = menu;

    // Prevent mousedown from reaching flatpickr's document-level outside-click
    // handler, which would close the calendar before the click completes.
    menu.addEventListener('mousedown', (e) => e.stopPropagation());

    MONTH_NAMES.forEach((name, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'fp-month__option';
      option.textContent = name;
      option.setAttribute('role', 'option');
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        fp.changeMonth(index - fp.currentMonth);
        label.textContent = name;
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      });
      menu.appendChild(option);
    });

    const openMenu = () => {
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 144; // matches min-width: 9rem
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${Math.max(4, rect.left + rect.width / 2 - menuWidth / 2)}px`;
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      const currentOption = menu.children[fp.currentMonth] as HTMLElement | undefined;
      currentOption?.scrollIntoView({ block: 'nearest' });
    };

    const closeMenu = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.hidden ? openMenu() : closeMenu();
    });

    this.monthMenuCloseHandler = () => closeMenu();
    document.addEventListener('click', this.monthMenuCloseHandler);

    // Sync the trigger label when the user navigates with the prev/next arrows.
    // Delay by one tick so flatpickr has updated fp.currentMonth first.
    this.monthNavSyncHandler = () =>
      setTimeout(() => {
        label.textContent = MONTH_NAMES[fp.currentMonth];
      }, 0);
    fp.calendarContainer
      .querySelectorAll('.flatpickr-prev-month, .flatpickr-next-month')
      .forEach((btn) => btn.addEventListener('click', this.monthNavSyncHandler!));

    wrapper.appendChild(trigger);
    nativeSelect.parentNode?.insertBefore(wrapper, nativeSelect);
  }
}
