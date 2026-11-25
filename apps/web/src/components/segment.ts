/**
 * One look for every "pick one of a few" control: a quiet track with the chosen option lifted
 * onto a card. Filters that narrow a list use soft brand chips instead; solid brand blue is kept
 * for the one action that moves the work forward.
 */
export const segmentTrack = 'scroll-x flex gap-1 rounded-[13px] bg-line/60 p-1';

export const segmentItem = (active: boolean) =>
  `min-h-10 flex-1 shrink-0 rounded-[10px] px-3 sm:flex-none sm:px-4 text-[14.5px] whitespace-nowrap transition-colors duration-150 ${
    active ? 'bg-raised font-semibold text-ink shadow-sm' : 'font-medium text-soft hover:text-ink'
  }`;
