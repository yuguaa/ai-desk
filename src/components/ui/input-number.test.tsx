// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputNumber } from "@/components/ui/input-number";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function renderInput(props: { value?: number; min?: number; max?: number; step?: number; disabled?: boolean; isValid?: (value: number) => boolean } = {}) {
  const onValueChange = vi.fn();
  function ControlledInput() {
    const [value, setValue] = useState(props.value ?? 12);
    return <InputNumber {...props} value={value} onValueChange={(next) => { onValueChange(next); setValue(next); }} />;
  }
  act(() => root.render(<ControlledInput />));
  return { input: container.querySelector("input")!, buttons: container.querySelectorAll("button"), onValueChange };
}

function typeValue(input: HTMLInputElement, value: string) {
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("InputNumber", () => {
  it.each(["0", "-0.5"])("restores the controlled value when custom validation rejects %s", (draft) => {
    const { input, onValueChange } = renderInput({ isValid: (value) => value > 0 });
    typeValue(input, draft);
    act(() => input.blur());
    expect(input.value).toBe("12");
    expect(onValueChange).not.toHaveBeenCalled();
    typeValue(input, "0.125");
    act(() => input.blur());
    expect(onValueChange).toHaveBeenLastCalledWith(0.125);
  });

  it("validates step button submissions", () => {
    const { input, buttons, onValueChange } = renderInput({ value: 0.5, isValid: (value) => value > 0 });
    act(() => buttons[0].click());
    expect(input.value).toBe("0.5");
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => buttons[1].click());
    expect(onValueChange).toHaveBeenLastCalledWith(1.5);
  });

  it.each([1, 0.5, 0.01])("preserves manually entered decimals independently of step %s", (step) => {
    const { input, onValueChange } = renderInput({ step });
    typeValue(input, "42.125");
    expect(input.validity.stepMismatch).toBe(false);
    act(() => input.blur());
    expect(onValueChange).toHaveBeenLastCalledWith(42.125);
    expect(input.value).toBe("42.125");
  });

  it("allows unbounded values and nudges by step without truncating decimals", () => {
    const { input, buttons, onValueChange } = renderInput({ value: -100.125, step: 0.5 });
    expect(input.hasAttribute("min")).toBe(false);
    expect(input.hasAttribute("max")).toBe(false);
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(false);
    act(() => buttons[0].click());
    expect(onValueChange).toHaveBeenLastCalledWith(-100.625);
    act(() => buttons[1].click());
    expect(onValueChange).toHaveBeenLastCalledWith(-100.125);
  });

  it.each(["", "invalid", "1e309"])("does not submit empty or invalid input %s as zero", (draft) => {
    const { input, onValueChange } = renderInput();
    typeValue(input, draft);
    act(() => input.blur());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe("12");
  });

  it("commits decimal input with Enter", () => {
    const { input, onValueChange } = renderInput();
    typeValue(input, "3.125");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onValueChange).toHaveBeenLastCalledWith(3.125);
  });

  it("retains explicit bounds for manual input and step buttons", () => {
    const { input, buttons, onValueChange } = renderInput({ value: 0.875, min: 0, max: 1, step: 0.25 });
    act(() => buttons[1].click());
    expect(onValueChange).toHaveBeenLastCalledWith(1);
    expect(buttons[1].disabled).toBe(true);
    typeValue(input, "-2");
    act(() => input.blur());
    expect(onValueChange).toHaveBeenLastCalledWith(0);
    expect(buttons[0].disabled).toBe(true);
    typeValue(input, "2");
    act(() => input.blur());
    expect(onValueChange).toHaveBeenLastCalledWith(1);
  });

  it.each([{ min: 0 }, { max: 20 }])("supports one-sided bounds: %j", (bounds) => {
    const { input, onValueChange } = renderInput(bounds);
    const value = bounds.min === undefined ? -100.125 : 100.125;
    typeValue(input, String(value));
    act(() => input.blur());
    expect(onValueChange).toHaveBeenLastCalledWith(value);
  });

  it("disables both buttons when disabled", () => {
    const { input, buttons, onValueChange } = renderInput({ disabled: true });
    expect(input.disabled).toBe(true);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    act(() => buttons[1].click());
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
