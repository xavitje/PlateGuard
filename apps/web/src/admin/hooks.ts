import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@plateguard/domain';
import { useTranslation } from 'react-i18next';
import type { AdminClient } from '../api/client';
import { useClient, useLocationId, useMe } from '../service/ServiceProvider';

type Reads =
  'ingredients' | 'equipment' | 'components' | 'dishes' | 'menuDraft' | 'floors' | 'staff';

/** What the signed-in user may do at this location. Only for hiding buttons: the API decides. */
export function useCan(): (p: Permission) => boolean {
  const permissions = useMe().data?.locations[0]?.permissions ?? [];
  return (p) => permissions.includes(p);
}

export function useAdmin<K extends Reads>(kind: K) {
  const client = useClient();
  const loc = useLocationId();
  return useQuery({
    queryKey: ['admin', kind, loc],
    queryFn: () => client.admin[kind](loc!) as Promise<Awaited<ReturnType<AdminClient[K]>>>,
    enabled: !!loc,
  });
}

export function useAllergens() {
  const client = useClient();
  const loc = useLocationId();
  const locale = useTranslation().i18n.language === 'nl' ? 'nl' : 'en';
  return useQuery({
    queryKey: ['admin', 'allergens', loc, locale],
    queryFn: () => client.admin.allergens(loc!, locale),
    enabled: !!loc,
    staleTime: Infinity,
  });
}

/**
 * A save in admin. Any recipe change can change the menu draft and its warnings, so the admin
 * reads refresh together; service keeps the published menu until someone publishes.
 */
export function useAdminSave<A extends unknown[], R>(
  fn: (client: AdminClient, loc: string, ...args: A) => Promise<R>,
  /** Shows the change at once; the server's answer replaces it. */
  optimistic?: (qc: QueryClient, loc: string | undefined, args: A) => void,
) {
  const client = useClient();
  const loc = useLocationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => {
      if (!loc) throw new Error('No location');
      return fn(client.admin, loc, ...args);
    },
    onMutate: (args) => optimistic?.(qc, loc, args),
    onError: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
    // Waits for the fresh lists, so a form that opens the saved row finds it.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['admin'] }),
        qc.invalidateQueries({ queryKey: ['menu', loc] }),
      ]),
  });
}
