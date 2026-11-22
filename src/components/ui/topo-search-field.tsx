"use client";

import { Label, SearchField } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

type SearchFieldVariant = NonNullable<
  ComponentProps<typeof SearchField>["variant"]
>;

export type TopoSearchFieldProps = {
  label?: ReactNode;
  ariaLabel?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  isDisabled?: boolean;
  name?: string;
  variant?: SearchFieldVariant;
  fullWidth?: boolean;
};

/**
 * HeroUI SearchField with icon + clear button group pre-wired.
 */
export function TopoSearchField({
  label,
  ariaLabel,
  value,
  defaultValue,
  onChange,
  onClear,
  placeholder,
  className,
  inputClassName,
  isDisabled,
  name,
  variant = "secondary",
  fullWidth = true,
}: TopoSearchFieldProps) {
  return (
    <SearchField
      className={className}
      variant={variant}
      fullWidth={fullWidth}
      value={value}
      defaultValue={defaultValue}
      name={name}
      isDisabled={isDisabled}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      onChange={onChange}
      onClear={onClear}
    >
      {label ? (
        <Label className="text-xs text-[color:var(--topo-muted)]">{label}</Label>
      ) : null}
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          placeholder={placeholder}
          className={inputClassName}
        />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
