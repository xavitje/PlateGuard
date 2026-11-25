import type { SeatUpdateInput, TableResponse } from '@plateguard/contracts';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceClient } from '../api/client';

const ClientContext = createContext<ServiceClient | null>(null);

/**
 * Gives the app its data source: the API in the app, an in-memory client in tests.
 * Server state lives in TanStack Query; writes update the table and refresh alerts and floors.
 */
export function ServiceProvider({
  client,
  children,
  queryClient,
}: {
  client: ServiceClient;
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [qc] = useState(
    () =>
      queryClient ??
      new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={qc}>
      <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
    </QueryClientProvider>
  );
}

function useClient(): ServiceClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient needs a ServiceProvider');
  return client;
}

const lang = (l: string) => (l === 'nl' ? 'nl' : 'en');

export function useMe() {
  const client = useClient();
  return useQuery({ queryKey: ['me'], queryFn: () => client.me() });
}

/** The location this device works for: the first one the user may see, until a picker exists. */
export function useLocationId(): string | undefined {
  return useMe().data?.locations[0]?.id;
}

export function useFloors() {
  const client = useClient();
  const loc = useLocationId();
  return useQuery({
    queryKey: ['floors', loc],
    queryFn: () => client.floors(loc!),
    enabled: !!loc,
  });
}

export function useMenu() {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  return useQuery({
    queryKey: ['menu', loc, locale],
    queryFn: () => client.menu(loc!, locale),
    enabled: !!loc,
    staleTime: 60_000,
  });
}

export function useAlerts() {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  return useQuery({
    queryKey: ['alerts', loc, locale],
    queryFn: () => client.alerts(loc!, locale),
    enabled: !!loc,
    refetchInterval: 15_000,
  });
}

export function useTable(label: string) {
  const client = useClient();
  const loc = useLocationId();
  return useQuery({
    queryKey: ['table', loc, label],
    queryFn: () => client.table(loc!, label),
    enabled: !!loc,
  });
}

type TableWrite =
  | { kind: 'seat'; seat: number; body: SeatUpdateInput }
  | { kind: 'order'; seat: number; dishId: string }
  | { kind: 'cancel'; plateId: string };

/** Every write at a table returns the new table; alerts and the floor counts refresh after. */
export function useTableWrite(label: string) {
  const client = useClient();
  const loc = useLocationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: TableWrite): Promise<TableResponse> => {
      if (!loc) throw new Error('No location');
      if (w.kind === 'seat') return client.saveSeat(loc, label, w.seat, w.body);
      if (w.kind === 'order') return client.order(loc, label, w.seat, w.dishId);
      return client.cancelOrder(loc, label, w.plateId);
    },
    // Allergies show at once, so quick taps build on each other; the server's answer replaces it.
    onMutate: (w) => {
      if (w.kind !== 'seat') return;
      qc.setQueryData<TableResponse>(['table', loc, label], (t) => {
        if (!t) return t;
        const others = t.bySeat.filter((s) => s.seat !== w.seat);
        const prev = t.bySeat.find((s) => s.seat === w.seat);
        const seat = {
          seat: w.seat,
          orders: prev?.orders ?? [],
          allergies: w.body.allergies,
          noAllergy: w.body.allergies.length === 0 && !!w.body.noAllergy,
        };
        return { ...t, bySeat: [...others, seat].sort((a, b) => a.seat - b.seat) };
      });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['table', loc, label] }),
    onSuccess: (table) => {
      qc.setQueryData(['table', loc, label], table);
      void qc.invalidateQueries({ queryKey: ['alerts', loc] });
      void qc.invalidateQueries({ queryKey: ['floors', loc] });
    },
  });
}
