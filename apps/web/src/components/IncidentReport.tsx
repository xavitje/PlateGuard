import type { IncidentKind, IncidentSeverity } from '@plateguard/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { useCan } from '../admin/hooks';
import { useClient, useLocationId } from '../service/ServiceProvider';

const KINDS: IncidentKind[] = ['REACTION', 'NEAR_MISS', 'OTHER'];
const SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];
const field =
  'min-h-11 w-full min-w-0 rounded-[10px] border border-line bg-card px-3 text-base text-ink';

/**
 * Reporting an allergy incident from a table: for one seat and optionally one plate. The server
 * freezes what is known now, so this is a short form that can be filled in under pressure.
 */
export function IncidentReport({
  label,
  seats,
  seat: currentSeat,
  plates,
}: {
  label: string;
  seats: number;
  seat: number;
  plates: { id: string; seat: number; name: string }[];
}) {
  const { t } = useTranslation();
  const can = useCan();
  const client = useClient();
  const loc = useLocationId();
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState(currentSeat);
  const [plateId, setPlate] = useState('');
  const [kind, setKind] = useState<IncidentKind>('REACTION');
  const [severity, setSeverity] = useState<IncidentSeverity>('HIGH');
  const [description, setDescription] = useState('');
  const send = useMutation({
    mutationFn: () =>
      client.reportIncident(loc!, label, {
        kind,
        severity,
        description: description.trim(),
        ...(plateId ? { plateId } : { seat }),
      }),
    onSuccess: () => {
      setOpen(false);
      setDescription('');
      setPlate('');
    },
  });
  if (!can('incident.report')) return null;
  if (!open)
    return (
      <div className="mx-1 mt-6 grid gap-2">
        {send.isSuccess && (
          <p role="status" className="text-[14px] font-medium">
            {t('admin:incidents.sent')}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setSeat(currentSeat);
            send.reset();
            setOpen(true);
          }}
          className="press min-h-11 justify-self-start rounded-full border border-red/40 px-4 text-[14px] font-semibold text-red"
        >
          {t('admin:incidents.report')}
        </button>
      </div>
    );
  const forSeat = plates.filter((p) => p.seat === seat);
  return (
    <form
      aria-labelledby="incident-title"
      className="mt-6 grid gap-3 rounded-[18px] bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <h2 id="incident-title" className="text-[17px] font-semibold">
        {t('admin:incidents.reportTitle', { table: label })}
      </h2>
      <p className="text-[13.5px] text-soft">{t('admin:incidents.reportHow')}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[13px] font-medium text-soft">
          {t('admin:incidents.field.seat')}
          <select
            className={field}
            value={seat}
            onChange={(e) => {
              setSeat(Number(e.target.value));
              setPlate('');
            }}
          >
            {Array.from({ length: seats }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {t('tables:seat.label', { seat: i + 1 })}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[13px] font-medium text-soft">
          {t('admin:incidents.plate')}
          <select className={field} value={plateId} onChange={(e) => setPlate(e.target.value)}>
            <option value="">{t('admin:incidents.noPlateChoice')}</option>
            {forSeat.map((p, i) => (
              <option key={p.id} value={p.id}>
                {forSeat.filter((x) => x.name === p.name).length > 1
                  ? `${p.name} (${forSeat.slice(0, i + 1).filter((x) => x.name === p.name).length})`
                  : p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-[13px] font-medium text-soft">
          {t('admin:incidents.field.kind')}
        </legend>
        {KINDS.map((k) => (
          <label key={k} className="flex min-h-9 items-center gap-2 text-[15px]">
            <input
              type="radio"
              name="kind"
              checked={kind === k}
              onChange={() => setKind(k)}
              className="size-4 accent-[var(--color-brand)]"
            />
            {t(`admin:incidents.kind.${k}`)}
          </label>
        ))}
      </fieldset>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-[13px] font-medium text-soft">
          {t('admin:incidents.field.severity')}
        </legend>
        <div className="flex gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
              className={`min-h-10 flex-1 rounded-full text-[14px] font-semibold ${
                severity === s ? 'bg-brand-soft font-semibold text-brand-ink' : 'bg-mist text-ink'
              }`}
            >
              {t(`admin:incidents.severity.${s}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-[13px] font-medium text-soft">
        {t('admin:incidents.field.description')}
        <textarea
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${field} py-2`}
        />
      </label>
      {send.isError && (
        <p role="alert" className="text-[14px] font-medium text-red">
          {t(`admin:errors.${send.error instanceof ApiError ? send.error.code : 'HTTP_ERROR'}`, {
            defaultValue: t('common:saveError'),
          })}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={send.isPending || !loc}
          className="press min-h-11 rounded-full bg-red px-4 text-[14px] font-semibold text-white"
        >
          {t('admin:incidents.send')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-full bg-mist px-4 text-[14px] font-semibold"
        >
          {t('admin:incidents.cancel')}
        </button>
      </div>
    </form>
  );
}
