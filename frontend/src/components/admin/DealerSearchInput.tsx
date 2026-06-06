"use client";

import { useEffect, useRef, useState } from "react";

// M39 E7-S3: debounced search input for the admin dealers list.
// Emits onChange when the user stops typing for ~300ms so the list
// query isn't fired on every keystroke.

interface DealerSearchInputProps {
  defaultValue?: string;
  placeholder?: string;
  onChange: (q: string) => void;
  debounceMs?: number;
}

export default function DealerSearchInput({
  defaultValue = "",
  placeholder = "Search dealers…",
  onChange,
  debounceMs = 300,
}: DealerSearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(value), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, onChange]);

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Search dealers</span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input-base min-h-11 w-full text-sm md:w-64"
      />
    </label>
  );
}
