"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AdminModule } from "@/lib/admin/permissions";

type HierarchicalModuleSelectorProps = {
  label: string;
  modules: AdminModule[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  lockedValues?: string[];
  disabled?: boolean;
};

function isSelectableModule(module: AdminModule): boolean {
  return module.href !== "#";
}

export function HierarchicalModuleSelector({
  label,
  lockedValues = [],
  modules,
  onChange,
  selectedValues,
  disabled = false
}: HierarchicalModuleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selectedValues);
  const lockedSet = new Set(lockedValues);
  const selectableValueSet = new Set(modules.filter(isSelectableModule).map((module) => String(module.key)));

  // Group modules by parentKey
  const topLevelModules = modules.filter((m) => m.parentKey === null);
  const modulesByParent = new Map<number | null, AdminModule[]>();

  modules.forEach((module) => {
    const parent = module.parentKey ?? null;
    if (!modulesByParent.has(parent)) {
      modulesByParent.set(parent, []);
    }
    modulesByParent.get(parent)!.push(module);
  });

  function setValues(values: string[]) {
    onChange(Array.from(new Set([...lockedValues, ...values])).filter((value) => selectableValueSet.has(value)));
  }

  function toggle(value: string, checked: boolean) {
    if (lockedSet.has(value)) return;
    const selectableSelectedValues = selectedValues.filter((item) => selectableValueSet.has(item));
    setValues(checked ? [...selectableSelectedValues, value] : selectableSelectedValues.filter((item) => item !== value));
  }

  function toggleGroup(parentKey: number) {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(parentKey)) {
      newExpanded.delete(parentKey);
    } else {
      newExpanded.add(parentKey);
    }
    setExpandedGroups(newExpanded);
  }

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 320; // max-height
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - rect.bottom;
      
      // Check if dropdown would overflow bottom
      let topPos = rect.bottom + 4;
      if (spaceBelow < dropdownHeight + 20) {
        // Not enough space below, try to position above
        topPos = rect.top - dropdownHeight - 4;
      }
      
      setDropdownPos({
        top: topPos,
        left: rect.left,
        width: rect.width
      });
      setDragOffset({ x: 0, y: 0 });
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  function handleMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    // Only allow dragging from header area (first 40px)
    if ((event.target as HTMLElement).closest(".dropdown-header")) {
      setIsDragging(true);
    }
  }

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      setDragOffset((prev) => ({
        x: prev.x + event.movementX,
        y: prev.y + event.movementY
      }));
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const selectedCount = Array.from(selectedSet).filter((value) => selectableValueSet.has(value) && !lockedSet.has(value)).length;
  const displayText = selectedCount > 0 ? `${selectedCount} modules selected` : "Select modules";

  return (
    <div className="relative w-full" ref={rootRef}>
      {label && <span className="block text-sm font-medium text-slate-700 mb-2">{label}</span>}
      <button
        className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => !disabled && setOpen((value) => !value)}
        type="button"
        disabled={disabled}
        ref={buttonRef}
      >
        <span className="min-w-0 truncate font-medium text-slate-800">{displayText}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && !disabled ? (
        <div 
          ref={dropdownRef}
          className="fixed z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-xl max-h-80 flex flex-col select-none" 
          style={{
            top: `${dropdownPos.top + dragOffset.y}px`,
            left: `${dropdownPos.left + dragOffset.x}px`,
            width: `${dropdownPos.width}px`,
            maxHeight: '320px',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="dropdown-header mb-3 flex gap-2 flex-shrink-0 cursor-grab active:cursor-grabbing pb-2 border-b border-slate-200">
            <button
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => setValues(modules.filter(isSelectableModule).map((m) => String(m.key)))}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
            >
              Select all
            </button>
            <button
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => setValues([])}
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
            >
              Unselect all
            </button>
          </div>
          <div className="space-y-1 overflow-auto flex-1 pr-1" style={{scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent'}}>
            {topLevelModules.map((parentModule) => {
              const children = modulesByParent.get(parentModule.key) || [];
              const isSelectable = isSelectableModule(parentModule);
              const isExpanded = expandedGroups.has(parentModule.key);
              const isChecked = selectedSet.has(String(parentModule.key));

              return (
                <div key={parentModule.key}>
                  {children.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1">
                        <button
                          className="p-0.5 hover:bg-slate-100 rounded"
                          onClick={() => toggleGroup(parentModule.key)}
                          type="button"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        {isSelectable ? (
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer flex-1">
                            <input
                              checked={isChecked}
                              className="h-4 w-4 rounded border-slate-300"
                              disabled={lockedSet.has(String(parentModule.key))}
                              onChange={(event) => toggle(String(parentModule.key), event.target.checked)}
                              type="checkbox"
                            />
                            <span>{parentModule.name}</span>
                          </label>
                        ) : (
                          <span className="text-sm font-semibold text-slate-700 flex-1">{parentModule.name}</span>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="ml-6 space-y-1 border-l border-slate-200 pl-2">
                          {children.map((childModule) => {
                            if (!isSelectableModule(childModule)) return null;
                            return (
                              <label
                                className={`flex items-center gap-2 text-sm font-medium ${
                                  lockedSet.has(String(childModule.key)) ? "text-slate-400" : "text-slate-700"
                                } cursor-pointer`}
                                key={childModule.key}
                              >
                                <input
                                  checked={selectedSet.has(String(childModule.key))}
                                  className="h-4 w-4 rounded border-slate-300"
                                  disabled={lockedSet.has(String(childModule.key))}
                                  onChange={(event) => toggle(String(childModule.key), event.target.checked)}
                                  type="checkbox"
                                />
                                <span className="truncate">{childModule.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : isSelectable ? (
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                      <input
                        checked={isChecked}
                        className="h-4 w-4 rounded border-slate-300"
                        disabled={lockedSet.has(String(parentModule.key))}
                        onChange={(event) => toggle(String(parentModule.key), event.target.checked)}
                        type="checkbox"
                      />
                      <span>{parentModule.name}</span>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
