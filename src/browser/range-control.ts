/** Native slider: callers own numeric ranges and session state. */
export function createRangeControl(
  label: string,
  range: { min: number; max: number; step: number },
  value: number,
  onChange: (value: number) => void,
  unit = '',
) {
  const group = document.createElement('label');
  group.className = 'range-control';
  const caption = document.createElement('span');
  caption.textContent = label;
  const output = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = String(range.step);
  input.setAttribute('aria-label', label);
  function setValue(value: number): void {
    input.value = String(value);
    output.textContent = `${value} ${unit}`.trim();
    input.setAttribute('aria-valuetext', output.textContent);
  }
  function change(): void {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < range.min || value > range.max) return;
    setValue(value);
    onChange(value);
  }
  function key(event: Event): void {
    event.stopPropagation();
  }
  input.addEventListener('input', change);
  input.addEventListener('keydown', key);
  setValue(value);
  group.replaceChildren(caption, output, input);
  return {
    group,
    setValue,
    dispose(): void {
      input.removeEventListener('input', change);
      input.removeEventListener('keydown', key);
    },
  };
}
