import type { Assessment, Component, ResolvedDish } from '@plateguard/domain';
import { useTranslation } from 'react-i18next';

/** What changes on the plate and what the kitchen checks by hand, on its own line under a dish row. */
export function AssessmentDetails({ result, dish }: { result: Assessment; dish?: ResolvedDish }) {
  const { t } = useTranslation();
  const blocking = dish ? blockingNames(result, dish) : [];
  return (
    <>
      {blocking.length > 0 && (
        <span className="col-span-full text-[12.5px] text-soft">
          {t('kitchen:blockedBy', { names: blocking.join(', ') })}
        </span>
      )}
      {result.modifications.length > 0 && (
        <span className="col-span-full text-[12.5px] text-soft">
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
        <span className="col-span-full text-[12.5px] text-soft">
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

/** The components the engine could not fix, so the waiter knows what to ask the guest about. */
function blockingNames(result: Assessment, dish: ResolvedDish): string[] {
  if (result.outcome !== 'DO_NOT_SERVE' || dish.kind !== 'dish') return [];
  const ids = new Set(
    result.reasons.flatMap((r) =>
      r.code === 'CONTAINS_UNRESOLVED' && r.componentId ? [r.componentId] : [],
    ),
  );
  const names: string[] = [];
  const walk = (c: Component) => {
    if (ids.has(c.id) && !names.includes(c.name)) names.push(c.name);
    c.components.forEach(walk);
  };
  dish.components.forEach(walk);
  return names;
}
