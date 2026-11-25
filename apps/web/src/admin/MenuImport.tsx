import type { ImportedDish, MenuImportInput } from '@plateguard/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminClient } from '../api/client';
import { useClient, useLocationId } from '../service/ServiceProvider';
import { useAllergens } from './hooks';
import { button, primary, SaveError } from './ui';

type File64 = MenuImportInput['files'][number];
const key = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Saves the checked dishes as recipes and puts them on the menu draft. Every new ingredient is
 * unverified, so the dishes stay UNKNOWN for guests until someone checks the allergens. Existing
 * ingredients with the same name are used as they are; nothing is published.
 */
export async function importDishes(admin: AdminClient, loc: string, dishes: ImportedDish[]) {
  const ingredients = new Map((await admin.ingredients(loc)).map((i) => [key(i.name), i.id]));
  // Same name and same ingredients: one component (the fries of three dishes).
  const components = new Map<string, string>();
  const dishIds: string[] = [];
  for (const dish of dishes) {
    const componentIds: string[] = [];
    for (const c of dish.components) {
      const ingredientIds: string[] = [];
      for (const i of c.ingredients) {
        let id = ingredients.get(key(i.name));
        if (!id) {
          id = (
            await admin.saveIngredient(loc, null, {
              name: i.name,
              contains: i.contains,
              mayContain: i.mayContain,
              verified: false,
            })
          ).id;
          ingredients.set(key(i.name), id);
        }
        if (!ingredientIds.includes(id)) ingredientIds.push(id);
      }
      const ck = `${key(c.name)}|${[...ingredientIds].sort().join()}`;
      let cid = components.get(ck);
      if (!cid) {
        cid = (await admin.saveComponent(loc, null, { name: c.name, ingredientIds })).id;
        components.set(ck, cid);
      }
      if (!componentIds.includes(cid)) componentIds.push(cid);
    }
    const saved = await admin.saveDish(loc, null, {
      name: dish.name,
      category: dish.category,
      priceCents: dish.priceCents,
      componentIds,
    });
    dishIds.push(saved.id);
  }
  const draft = await admin.menuDraft(loc);
  await admin.setMenuItems(loc, [...draft.dishIds, ...dishIds]);
  return dishIds.length;
}

/** Photos are made smaller first: phone photos are too big for one request. */
async function toBase64(file: File): Promise<File64> {
  if (file.type === 'application/pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { mediaType: 'application/pdf', data: btoa(bin) };
  }
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) };
}

const euro = (cents: number) =>
  (cents / 100).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

/** Beheer > Receptuur > Menu importeren: photo or PDF in, checked dishes out as a draft. */
export function MenuImport() {
  const { t } = useTranslation();
  const client = useClient();
  const loc = useLocationId();
  const qc = useQueryClient();
  const names = new Map((useAllergens().data ?? []).map((a) => [a.code, a.name]));
  const [files, setFiles] = useState<File[]>([]);
  const [dishes, setDishes] = useState<ImportedDish[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const read = useMutation({
    mutationFn: async () => {
      const body = { files: await Promise.all(files.map(toBase64)) };
      if (body.files.reduce((n, f) => n + f.data.length, 0) > 4_000_000)
        throw new Error('TOO_LARGE');
      return client.admin.importMenu(loc!, body);
    },
    onSuccess: (p) => {
      setDishes(p.dishes);
      setPicked(new Set(p.dishes.map((_, i) => i)));
    },
  });
  const save = useMutation({
    mutationFn: () =>
      importDishes(
        client.admin,
        loc!,
        dishes!.filter((_, i) => picked.has(i)),
      ),
    onSuccess: () => {
      setDishes(null);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['admin'] }),
        qc.invalidateQueries({ queryKey: ['menu', loc] }),
      ]);
    },
  });

  return (
    <div className="grid max-w-3xl gap-4">
      <p className="text-soft">{t('admin:import.intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          aria-label={t('admin:import.files')}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
        />
        <button
          className={primary}
          disabled={files.length === 0 || read.isPending}
          onClick={() => read.mutate()}
        >
          {read.isPending ? t('admin:import.reading') : t('admin:import.read')}
        </button>
      </div>
      {read.error?.message === 'TOO_LARGE' ? (
        <p className="text-[13.5px] text-red">{t('admin:import.tooLarge')}</p>
      ) : (
        <SaveError error={read.error} />
      )}
      {save.isSuccess && !dishes && (
        <p className="rounded-lg bg-green/10 p-3 text-[13.5px]">
          {t('admin:import.done', { count: save.data })}
        </p>
      )}
      {dishes && (
        <>
          <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-[13.5px]">
            {t('admin:import.check')}
          </p>
          {dishes.length === 0 && <p className="text-soft">{t('admin:import.none')}</p>}
          <ul className="grid gap-3">
            {dishes.map((d, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <label className="flex items-baseline gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={() => {
                      const next = new Set(picked);
                      if (!next.delete(i)) next.add(i);
                      setPicked(next);
                    }}
                  />
                  {d.name}
                  <span className="text-[13px] font-normal text-soft">
                    {[d.category, d.priceCents !== null && euro(d.priceCents)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </label>
                {d.description && <p className="mt-1 text-[13px] text-soft">{d.description}</p>}
                <ul className="mt-2 grid gap-1 text-[13.5px]">
                  {d.components.map((c, j) => (
                    <li key={j}>
                      <span className="font-medium">{c.name}:</span>{' '}
                      {c.ingredients
                        .map((ing) => {
                          const all = [
                            ...ing.contains.map((a) => names.get(a) ?? a),
                            ...ing.mayContain.map(
                              (a) => `${t('admin:import.may')} ${names.get(a) ?? a}`,
                            ),
                          ];
                          return all.length ? `${ing.name} (${all.join(', ')})` : ing.name;
                        })
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <SaveError error={save.error} />
          <div className="flex gap-3">
            <button
              className={primary}
              disabled={picked.size === 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {t('admin:import.save', { count: picked.size })}
            </button>
            <button className={button} onClick={() => setDishes(null)}>
              {t('admin:import.cancel')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
