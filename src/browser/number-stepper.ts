interface NumberStepperOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

/** Bounded decimal controls; integer ticks prevent accumulated floating-point drift. */
export function createNumberStepper(options: NumberStepperOptions, documentRef: Document = document) {
  const { label, min, max, step, format, onChange } = options;
  const digits = Math.max(...[min, max, step].map((value) => String(value).split('.')[1]?.length ?? 0));
  const last = Math.round((max - min) / step);
  let tick = 0;
  const group = documentRef.createElement('div');
  group.className = 'number-stepper';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const output = documentRef.createElement('output');
  output.setAttribute('aria-live', 'polite');
  const stopKey = (event: Event) => event.stopPropagation();
  const removers: (() => void)[] = [];
  const button = (direction: -1 | 1) => {
    const element = documentRef.createElement('button');
    element.type = 'button';
    element.className = 'selector-button number-step';
    element.textContent = direction < 0 ? '−' : '+';
    element.setAttribute('aria-label', `${label}を${direction < 0 ? '下げる' : '上げる'}`);
    const change = () => {
      const next = Math.max(0, Math.min(last, tick + direction));
      if (next === tick) return;
      tick = next;
      render();
      onChange(read());
    };
    element.addEventListener('click', change);
    // Keep native Enter/Space activation without also issuing driving commands.
    element.addEventListener('keydown', stopKey);
    removers.push(() => {
      element.removeEventListener('click', change);
      element.removeEventListener('keydown', stopKey);
    });
    return element;
  };
  const minus = button(-1),
    plus = button(1);
  const read = () => Number((min + tick * step).toFixed(digits));
  function render(): void {
    output.textContent = format(read());
    minus.disabled = tick === 0;
    plus.disabled = tick === last;
  }
  function setValue(value: number): void {
    tick = Math.max(0, Math.min(last, Math.round((value - min) / step)));
    render();
  }
  group.replaceChildren(minus, output, plus);
  setValue(options.value);
  return {
    group,
    setValue,
    dispose() {
      for (const remove of removers) remove();
    },
  };
}
