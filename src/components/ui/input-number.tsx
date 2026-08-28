import * as React from "react";
import { Minus, Plus } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type InputNumberProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
};

function InputNumber({ className, value, min, max, step = 1, onValueChange, onBlur, onKeyDown, ...props }: InputNumberProps) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => setDraft(String(value)), [value]);

  const normalize = (nextValue: number) => {
    const precision = String(step).split(".")[1]?.length ?? 0;
    return Number(Math.min(max, Math.max(min, nextValue)).toFixed(precision));
  };

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const nextValue = normalize(parsed);
    setDraft(String(nextValue));
    onValueChange(nextValue);
  };

  const nudge = (direction: -1 | 1) => {
    const nextValue = normalize(value + direction * step);
    setDraft(String(nextValue));
    onValueChange(nextValue);
  };

  return (
    <div data-slot="input-number" className={cn("flex h-7 w-fit items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)] shadow-[var(--control-shadow)] focus-within:border-[var(--accent)] focus-within:shadow-[var(--focus-ring)]", className)}>
      <button type="button" aria-label={`减少${props["aria-label"] ?? "数值"}`} className="grid w-7 cursor-pointer place-items-center border-r border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40" disabled={value <= min || props.disabled} onClick={() => nudge(-1)}><Minus size={11} /></button>
      <div className="flex min-w-0 items-center bg-[var(--control-bg)]">
        <input
          {...props}
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          className="h-full w-14 appearance-none bg-transparent px-1.5 text-right font-mono text-[var(--font-size-11)] tabular-nums text-[var(--text-primary)] outline-none"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => { commit(); onBlur?.(event); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            onKeyDown?.(event);
          }}
        />
      </div>
      <button type="button" aria-label={`增加${props["aria-label"] ?? "数值"}`} className="grid w-7 cursor-pointer place-items-center border-l border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40" disabled={value >= max || props.disabled} onClick={() => nudge(1)}><Plus size={11} /></button>
    </div>
  );
}

export { InputNumber };
