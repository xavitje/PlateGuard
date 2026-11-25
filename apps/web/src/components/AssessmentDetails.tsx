import type { Assessment } from '@plateguard/domain';
import { useTranslation } from 'react-i18next';

/** What changes on the plate and what the kitchen checks by hand, under a dish in a 3-column row. */
export function AssessmentDetails({ result }: { result: Assessment }) {
  const { t } = useTranslation();
  return (
    <>
      {result.modifications.length > 0 && (
        <span className="col-span-3 text-[12.5px] text-soft">
          {result.modifications
            .map((m) =>
              m.action === 'SUBSTITUTE'
                ? `${m.componentName} → ${m.substitute?.name}`
                : `− ${m.componentName}`,
            )
            .join(' · ')}
        </span>
      )}
      {result.manualChecks.length > 0 && (
        <span className="col-span-3 text-[12.5px] text-soft">
          {result.manualChecks
            .map((m) =>
              m.kind === 'CUSTOM'
                ? t('kitchen:manualCheck', { label: m.label })
                : t('kitchen:manualCheckTraces', { label: m.label }),
            )
            .join(' · ')}
        </span>
      )}
    </>
  );
}
