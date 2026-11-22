"use client";

import { Checkbox } from "@heroui/react";
import type { ReactNode } from "react";

export type TopoCheckboxProps = {
  children?: ReactNode;
  isSelected?: boolean;
  defaultSelected?: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  onChange?: (isSelected: boolean) => void;
  className?: string;
  compact?: boolean;
  name?: string;
  value?: string;
  "aria-label"?: string;
};

/**
 * HeroUI Checkbox with Control + Indicator wired for table and form use.
 */
export function TopoCheckbox({
  children,
  isSelected,
  defaultSelected,
  isIndeterminate,
  isDisabled,
  onChange,
  className,
  compact = false,
  name,
  value,
  "aria-label": ariaLabel,
}: TopoCheckboxProps) {
  return (
    <Checkbox
      className={className}
      isSelected={isSelected}
      defaultSelected={defaultSelected}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      name={name}
      value={value}
      aria-label={ariaLabel}
      onChange={onChange}
    >
      <Checkbox.Content
        className={compact ? "min-h-8 gap-2 py-0" : undefined}
      >
        <Checkbox.Control className={compact ? "size-4" : undefined}>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {children ? <span>{children}</span> : null}
      </Checkbox.Content>
    </Checkbox>
  );
}
