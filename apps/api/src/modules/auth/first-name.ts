import { normalizeLabel } from '@plateguard/domain';

/** "José van Dijk" and "jose" both give "jose": the first word, without case or accents. */
export function firstNameKey(name: string): string {
  return normalizeLabel(name).split(' ')[0] ?? '';
}
