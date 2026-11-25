import type { Outcome } from '@plateguard/domain';
import { useTranslation } from 'react-i18next';

const STYLE: Record<Outcome, string> = {
  DO_NOT_SERVE: 'bg-[var(--pg-out-stop-bg)] text-[var(--pg-out-stop)]',
  UNKNOWN: '[background:var(--pg-out-unknown-bg)] text-[var(--pg-out-unknown)]',
  CAUTION: 'bg-[var(--pg-out-warn-bg)] text-[var(--pg-out-warn)]',
  ADAPTABLE: 'bg-[var(--pg-out-adjust-bg)] text-[var(--pg-out-adjust)]',
  CLEAR_WITH_NOTE: 'bg-[var(--pg-out-none-bg)] text-[var(--pg-out-none)]',
  CLEAR: 'bg-[var(--pg-out-none-bg)] text-[var(--pg-out-none)]',
};

/** Outcome as a pill. Never green: "none found" is neutral grey. Unknown is always hatched. */
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold leading-tight whitespace-nowrap ${STYLE[outcome]}`}
      data-outcome={outcome}
    >
      {t(`common:outcome.${outcome}`)}
    </span>
  );
}
