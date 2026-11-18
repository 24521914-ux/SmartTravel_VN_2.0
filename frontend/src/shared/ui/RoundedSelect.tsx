import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Icon } from './Icon';

export interface RoundedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RoundedSelectProps {
  id?: string;
  name?: string;
  /** Accessible name applied to the combobox trigger via aria-label when no external label points to id. */
  label?: string;
  value?: string | string[];
  defaultValue?: string | string[];
  options: RoundedSelectOption[];
  onChange?: (value: string) => void;
  onMultiChange?: (values: string[]) => void;
  placeholder?: string;
  compact?: boolean;
  fitContent?: boolean;
  pill?: boolean;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
  className?: string;
}

function findScrollContainerBottom(element: HTMLElement | null): number {
  let curr = element?.parentElement ?? null;
  while (curr && curr !== document.body) {
    const overflowY = getComputedStyle(curr).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
      return Math.min(window.innerHeight, curr.getBoundingClientRect().bottom);
    }
    curr = curr.parentElement;
  }
  return window.innerHeight;
}

/** Accessible rounded combobox/listbox replacing sharp native OS select popups. */
export function RoundedSelect({
  id,
  name,
  label,
  value,
  defaultValue,
  options,
  onChange,
  onMultiChange,
  placeholder = '',
  compact = false,
  fitContent = false,
  pill = false,
  disabled = false,
  required = false,
  multiple = false,
  className = '',
}: RoundedSelectProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const [internalSingle, setInternalSingle] = useState<string>(() =>
    typeof defaultValue === 'string' ? defaultValue : '',
  );
  const [internalMulti, setInternalMulti] = useState<string[]>(() =>
    Array.isArray(defaultValue) ? defaultValue : [],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    if (value === undefined && !multiple && typeof defaultValue === 'string') {
      setInternalSingle(defaultValue);
    }
  }, [defaultValue, value, multiple]);

  useEffect(() => {
    if (value === undefined && multiple && Array.isArray(defaultValue)) {
      setInternalMulti(defaultValue);
    }
  }, [defaultValue, value, multiple]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const containerBottom = findScrollContainerBottom(triggerRef.current);
    const spaceBelow = containerBottom - rect.bottom;
    const spaceAbove = rect.top;
    setPlacement(spaceBelow < 220 && spaceAbove > spaceBelow ? 'top' : 'bottom');
    const estimatedWidth = Math.max(rect.width, 280);
    setAlign(
      rect.left + estimatedWidth > window.innerWidth - 16 && rect.right - estimatedWidth >= 16
        ? 'end'
        : 'start',
    );
  }, [open, options.length]);

  const singleValue = !multiple
    ? typeof value === 'string'
      ? value
      : internalSingle
    : '';
  const multiValues = multiple
    ? Array.isArray(value)
      ? value
      : internalMulti
    : [];

  const selectedIndex = multiple
    ? Math.max(0, options.findIndex(option => multiValues.includes(option.value)))
    : Math.max(0, options.findIndex(option => option.value === singleValue));
  const selectedOption = multiple ? undefined : options.find(option => option.value === singleValue);

  const displayLabel = multiple
    ? multiValues.length > 0
      ? options
          .filter(option => multiValues.includes(option.value))
          .map(option => option.label)
          .join(', ') || `${multiValues.length} mục đã chọn`
      : placeholder || options[0]?.label || 'Chọn mục'
    : selectedOption?.label ?? placeholder ?? options[0]?.label ?? '';

  const enabledIndices = options
    .map((opt, i) => (!opt.disabled ? i : -1))
    .filter(i => i !== -1);

  const focusOption = (index: number) => {
    if (!enabledIndices.length) return;
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    if (options[clamped] && !options[clamped].disabled) {
      optionRefs.current[clamped]?.focus();
      return;
    }
    const next = enabledIndices.find(i => i >= clamped) ?? enabledIndices[enabledIndices.length - 1];
    optionRefs.current[next]?.focus();
  };

  const focusStep = (fromIndex: number, delta: 1 | -1) => {
    if (!enabledIndices.length) return;
    const pos = enabledIndices.indexOf(fromIndex);
    if (pos === -1) {
      focusOption(delta > 0 ? enabledIndices[0] : enabledIndices[enabledIndices.length - 1]);
      return;
    }
    const nextPos = Math.min(enabledIndices.length - 1, Math.max(0, pos + delta));
    optionRefs.current[enabledIndices[nextPos]]?.focus();
  };

  const focusTypeahead = (key: string, startAfterIndex = -1) => {
    const ch = key.toLocaleLowerCase();
    for (let offset = 1; offset <= options.length; offset++) {
      const idx = (startAfterIndex + offset) % options.length;
      const opt = options[idx];
      if (opt && !opt.disabled && opt.label.trim().toLocaleLowerCase().startsWith(ch)) {
        if (!open) {
          setOpen(true);
          window.requestAnimationFrame(() => optionRefs.current[idx]?.focus());
        } else {
          optionRefs.current[idx]?.focus();
        }
        return true;
      }
    }
    return false;
  };

  const showMenu = (index = selectedIndex) => {
    if (disabled || !options.length) return;
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };

  const choose = (option: RoundedSelectOption) => {
    if (option.disabled) return;
    if (multiple) {
      const exists = multiValues.includes(option.value);
      const next = exists
        ? multiValues.filter(v => v !== option.value)
        : [...multiValues, option.value];
      if (value === undefined) setInternalMulti(next);
      onMultiChange?.(next);
      return;
    }
    if (value === undefined) setInternalSingle(option.value);
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      showMenu(event.key === 'ArrowUp' ? options.length - 1 : selectedIndex);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) {
        if (!multiple && selectedOption) choose(selectedOption);
        else setOpen(false);
      } else {
        showMenu();
      }
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (focusTypeahead(event.key, selectedIndex)) event.preventDefault();
    }
  };

  const handleOptionKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusStep(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusStep(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (enabledIndices.length) optionRefs.current[enabledIndices[0]]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      if (enabledIndices.length) optionRefs.current[enabledIndices[enabledIndices.length - 1]]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (focusTypeahead(event.key, index)) event.preventDefault();
    }
  };

  const rootClasses = [
    'rounded-select',
    compact && 'rounded-select-compact',
    fitContent && 'rounded-select-fit',
    pill && 'rounded-select-pill',
    open && 'is-open',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClasses} ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="rounded-select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : showMenu())}
        onKeyDown={handleTriggerKey}
      >
        <span>{displayLabel}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {name && !multiple && (
        <input
          type="text"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="rounded-select-form-proxy"
          name={name}
          value={singleValue}
          required={Boolean(required && !disabled)}
          onChange={() => {}}
          onInvalid={() => triggerRef.current?.focus()}
        />
      )}
      {name && multiple &&
        multiValues.map(val => (
          <input key={val} type="hidden" name={name} value={val} />
        ))}
      {open && !disabled && (
        <div
          className="rounded-select-popover"
          id={listboxId}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          aria-label={label}
          data-placement={placement}
          data-align={align}
        >
          {options.map((option, index) => {
            const isSelected = multiple
              ? multiValues.includes(option.value)
              : option.value === singleValue;
            return (
              <button
                key={`${option.value}-${index}`}
                ref={node => {
                  optionRefs.current[index] = node;
                }}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                data-value={option.value}
                aria-selected={isSelected}
                disabled={option.disabled}
                className="rounded-select-option"
                onClick={() => choose(option)}
                onKeyDown={event => handleOptionKey(event, index)}
              >
                <span>{option.label}</span>
                <span aria-hidden="true" className="rounded-select-check">
                  {isSelected ? '✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
