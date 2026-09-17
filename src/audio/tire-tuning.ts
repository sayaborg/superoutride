import { resolveModalTuning, sameModalTuning, type ModalTuning } from './tire-modal-acoustics.js';
import { resolveUnifiedTuning, sameUnifiedTuning, type UnifiedTuning } from './tire-unified-acoustics.js';
import type { TireSoundModel } from './tire-sound-controls.js';

/** Model identity travels with tuning; common field names never make the two contracts interchangeable. */
export type TireTuning =
  | { readonly model: 'modal'; readonly tuning: ModalTuning }
  | { readonly model: 'unified'; readonly tuning: UnifiedTuning };

export function resolveTireTuning(model: TireSoundModel, value?: unknown): TireTuning | null {
  if (model !== 'modal' && model !== 'unified') return null;
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value)))
    throw new RangeError('invalid tire tuning');
  return model === 'modal'
    ? { model, tuning: resolveModalTuning(value as Partial<ModalTuning> | undefined) }
    : { model, tuning: resolveUnifiedTuning(value as Partial<UnifiedTuning> | undefined) };
}

export function sameTireTuning(a: TireTuning | null, b: TireTuning | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.model === 'modal' && b.model === 'modal') return sameModalTuning(a.tuning, b.tuning);
  if (a.model === 'unified' && b.model === 'unified') return sameUnifiedTuning(a.tuning, b.tuning);
  return false;
}
