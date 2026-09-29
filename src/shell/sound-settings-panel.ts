import { createRangeControl } from './range-control.js';

/**
 * One DEV sound-settings group: audio owns ranges and validation; the panel owns labels only. It starts from, and
 * its reset returns to, `initial`: the delivered audio document's record.
 */
export function createSoundSettingsPanel<T extends Readonly<Record<keyof T, number>>>(
  legendText: string,
  ranges: Readonly<Record<keyof T, { min: number; max: number; step: number }>>,
  resolve: (value?: Partial<T>) => T,
  initial: T,
  labels: Readonly<Record<keyof T, readonly [string, string]>>,
  onChange: () => void,
  resetText: string,
) {
  let settings = initial;
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = legendText;
  const note = document.createElement('p');
  note.textContent =
    '実測値ではない音響調整です。初期値は音の設定の文書の値で、聴いて決めた値ではありません。設定は再読み込みで戻ります。';
  const controls = (Object.keys(labels) as (keyof T)[]).map((key) => {
    const [label, unit] = labels[key];
    const control = createRangeControl(
      label,
      ranges[key],
      settings[key]!,
      (value) => {
        try {
          settings = resolve({ ...settings, [key]: value });
        } catch {
          // A cross-field domain rejected the value: keep the previous setting.
          control.setValue(settings[key]!);
          return;
        }
        onChange();
      },
      unit,
    );
    control.group.setAttribute('data-sound-setting-key', String(key));
    return { key, ...control };
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = resetText;
  const restore = (): void => {
    settings = initial;
    for (const control of controls) control.setValue(settings[control.key]!);
    onChange();
  };
  reset.addEventListener('click', restore);
  fieldset.replaceChildren(legend, note, ...controls.map((c) => c.group), reset);
  return {
    fieldset,
    read: (): T => settings,
    setEnabled(value: boolean): void {
      fieldset.disabled = !value;
    },
    dispose(): void {
      reset.removeEventListener('click', restore);
      for (const control of controls) control.dispose();
    },
  };
}

/** Mounts one panel into its host, replacing the host's children; disposal empties the host. */
export function mountSoundSettingsPanel<T>(
  host: HTMLElement,
  panel: { fieldset: HTMLFieldSetElement; read: () => T; setEnabled(value: boolean): void; dispose(): void },
) {
  host.replaceChildren(panel.fieldset);
  return {
    read: panel.read,
    setEnabled: panel.setEnabled,
    dispose(): void {
      panel.dispose();
      host.replaceChildren();
    },
  };
}
