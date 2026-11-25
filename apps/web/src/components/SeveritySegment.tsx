import { SEVERITIES, type Severity } from '@plateguard/domain';
import { useTranslation } from 'react-i18next';

/** Three-way switch per allergy. Nothing chosen means Severe, so it starts there. */
export function SeveritySegment({
  value,
  onChange,
  label,
}: {
  value: Severity;
  onChange: (s: Severity) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-3 gap-0 rounded-[11px] bg-mist p-[3px]"
      >
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={`min-h-[34px] rounded-[9px] text-[13px] font-medium transition-colors ${
              value === s ? 'bg-raised font-semibold shadow-sm' : 'text-soft'
            } ${value === s && s === 'SEVERE' ? 'text-red' : ''}`}
          >
            {t(`common:severity.${s}`)}
          </button>
        ))}
      </div>
      <span className="text-[12.5px] text-soft">{t(`common:severityHint.${value}`)}</span>
    </div>
  );
}
