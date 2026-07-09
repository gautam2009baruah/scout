"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type MultiSelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type MultiSelectDropdownProps = {
  label: string;
  name?: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  lockedValues?: string[];
  emptyLabel?: string;
};

export function MultiSelectDropdown({
  emptyLabel = "Select options",
  label,
  lockedValues = [],
  name,
  onChange,
  options,
  selectedValues
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selectedValues);
  const lockedSet = new Set(lockedValues);
  const selectedLabels = options.filter((option) => selectedSet.has(option.value)).map((option) => option.label);
  const activeOptions = options.filter((option) => !option.disabled || lockedSet.has(option.value));

  function setValues(values: string[]) {
    onChange(Array.from(new Set([...lockedValues, ...values])));
  }

  function toggle(value: string, checked: boolean) {
    if (lockedSet.has(value)) {
      return;
    }

    setValues(checked ? [...selectedValues, value] : selectedValues.filter((item) => item !== value));
  }

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <span className="block text-sm font-medium text-slate-700 mb-2">{label}</span>
      {name
        ? selectedValues.map((value) => <input key={value} name={name} type="hidden" value={value} />)
        : null}
      <button
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="min-w-0 truncate font-medium text-slate-800">
          {selectedLabels.length ? selectedLabels.join(", ") : emptyLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute z-20 mt-2 w-full min-w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex gap-2">
            <button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setValues(activeOptions.map((option) => option.value))} type="button">
              Select all
            </button>
            <button className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setValues([])} type="button">
              Unselect all
            </button>
          </div>
          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {options.map((option) => (
              <label className={`flex items-center gap-2 text-sm font-medium ${option.disabled ? "text-slate-400" : "text-slate-700"}`} key={option.value}>
                <input
                  checked={selectedSet.has(option.value)}
                  className="h-4 w-4 rounded border-slate-300"
                  disabled={option.disabled || lockedSet.has(option.value)}
                  onChange={(event) => toggle(option.value, event.target.checked)}
                  type="checkbox"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
