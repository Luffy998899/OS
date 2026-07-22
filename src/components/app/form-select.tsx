"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Option = { value: string; label: string };

export function FormSelect({
  value,
  onValueChange,
  placeholder,
  options,
  className,
  id,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: Option[];
  className?: string;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
