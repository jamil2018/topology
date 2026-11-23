"use client";

import { Button, Label, ListBox, Select } from "@heroui/react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

export type TopoSelectOption = {
  id: string;
  label: ReactNode;
  textValue?: string;
};

type SelectVariant = NonNullable<ComponentProps<typeof Select>["variant"]>;
type TriggerProps = Omit<
  ComponentProps<typeof Select.Trigger>,
  "children" | "className"
> & Record<`data-${string}`, string | boolean | undefined>;

export type TopoSelectProps = {
  label?: ReactNode;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: TopoSelectOption[];
  className?: string;
  triggerClassName?: string;
  /** Forwarded to Select.Trigger (data-* for keyboard shortcuts, etc.). */
  triggerProps?: TriggerProps;
  valueClassName?: string;
  compact?: boolean;
  variant?: SelectVariant;
  placeholder?: string;
  isDisabled?: boolean;
  name?: string;
  /**
   * Defer mounting the HeroUI Select + ListBox until the user interacts.
   * Dense tables should pass this so idle rows stay cheap.
   */
  lazy?: boolean;
};

function optionLabel(
  options: TopoSelectOption[],
  value: string,
  placeholder?: string,
): ReactNode {
  const match = options.find((option) => option.id === value);
  if (match) return match.label;
  return placeholder ?? value;
}

/**
 * Thin HeroUI Select + ListBox wrapper with consistent trigger chrome.
 * Pass `compact` for dense table / toolbar rows.
 * Pass `lazy` to avoid mounting Select/Popover/ListBox until interaction.
 */
export function TopoSelect({
  label,
  ariaLabel,
  value,
  onChange,
  options,
  className,
  triggerClassName,
  triggerProps,
  valueClassName,
  compact = false,
  variant = "secondary",
  placeholder,
  isDisabled,
  name,
  lazy = false,
}: TopoSelectProps) {
  const id = useId();
  const [active, setActive] = useState(!lazy);
  const [open, setOpen] = useState(false);
  const pendingOpen = useRef(false);
  const resolvedAria =
    ariaLabel ?? (typeof label === "string" ? label : undefined);

  useLayoutEffect(() => {
    if (!pendingOpen.current) return;
    pendingOpen.current = false;
    setOpen(true);
  }, [active]);

  if (!active) {
    return (
      <div className={className}>
        {label ? (
          <Label className="text-xs text-[color:var(--topo-muted)]">{label}</Label>
        ) : null}
        <Button
          type="button"
          variant={variant}
          isDisabled={isDisabled}
          aria-labelledby={resolvedAria ? `${id}-value ${id}-label` : undefined}
          aria-haspopup="listbox"
          aria-expanded={false}
          className={
            compact
              ? `h-8 min-h-8 w-full justify-between gap-1 px-2 py-0 text-left text-sm font-normal ${triggerClassName ?? ""}`.trim()
              : `w-full justify-between text-left font-normal ${triggerClassName ?? ""}`.trim()
          }
          onPress={() => {
            pendingOpen.current = true;
            setActive(true);
          }}
          {...(triggerProps as ComponentProps<typeof Button>)}
        >
          <span id={`${id}-value`} className={`min-w-0 truncate ${valueClassName ?? ""}`.trim()}>
            {optionLabel(options, value, placeholder)}
          </span>
          {resolvedAria ? <span id={`${id}-label`} className="sr-only">{resolvedAria}</span> : null}
          <span
            aria-hidden
            className="shrink-0 text-[color:var(--topo-muted)]"
          >
            ▾
          </span>
        </Button>
      </div>
    );
  }

  return (
    <Select
      className={className}
      variant={variant}
      placeholder={placeholder}
      value={value}
      name={name}
      isDisabled={isDisabled}
      isOpen={lazy ? open : undefined}
      aria-label={resolvedAria}
      onOpenChange={
        lazy
          ? (next) => {
              setOpen(Boolean(next));
            }
          : undefined
      }
      onChange={(next) => {
        if (next == null) return;
        onChange(String(next));
      }}
    >
      {label ? (
        <Label className="text-xs text-[color:var(--topo-muted)]">{label}</Label>
      ) : null}
      <Select.Trigger
        {...triggerProps}
        className={
          compact
            ? `h-8 min-h-8 py-0 ${triggerClassName ?? ""}`.trim()
            : triggerClassName
        }
      >
        <Select.Value className={valueClassName} />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => {
            const textValue =
              option.textValue ??
              (typeof option.label === "string" ? option.label : option.id);
            return (
              <ListBox.Item key={option.id} id={option.id} textValue={textValue}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
