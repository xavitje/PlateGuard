import type { Choice } from '@plateguard/domain';
import type {
  AlertResponse,
  LoginResponse,
  SeatUpdateInput,
  TableResponse,
} from '@plateguard/contracts';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceClient } from '../api/client';
import { getToken, setToken } from '../session';

/** Fired by the HTTP client when the API says the session ended. */
export const SIGNED_OUT_EVENT = 'pg:signed-out';

interface Session {
  signedIn: boolean;
  signIn: (res: LoginResponse) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

const ClientContext = createContext<ServiceClient | null>(null);

/**
 * Gives the app its data source: the API in the app, an in-memory client in tests.
 * Server state lives in TanStack Query; writes update the table and refresh alerts and floors.
 */
export function ServiceProvider({
  client,
  children,
  queryClient,
  signedIn: initiallySignedIn,
}: {
  client: ServiceClient;
  children: ReactNode;
  queryClient?: QueryClient;
  /** Tests start signed in; the app reads the stored session. */
  signedIn?: boolean;
}) {
  const [qc] = useState(
    () =>
      queryClient ??
      new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  const [signedIn, setSignedIn] = useState(() => initiallySignedIn ?? getToken() !== null);

  const signOut = useCallback(() => {
    setToken(null);
    setSignedIn(false);
    // The platform screen has its own session: leaving a restaurant keeps it working.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'platform' });
  }, [qc]);
  const signIn = useCallback(
    (res: LoginResponse) => {
      qc.clear();
      setToken(res.token);
      qc.setQueryData(['me'], res.me);
      setSignedIn(true);
    },
    [qc],
  );
  useEffect(() => {
    window.addEventListener(SIGNED_OUT_EVENT, signOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signOut);
  }, [signOut]);
  const session = useMemo(() => ({ signedIn, signIn, signOut }), [signedIn, signIn, signOut]);

  return (
    <QueryClientProvider client={qc}>
      <ClientContext.Provider value={client}>
        <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
      </ClientContext.Provider>
    </QueryClientProvider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a ServiceProvider');
  return session;
}

export function useClient(): ServiceClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient needs a ServiceProvider');
  return client;
}

const lang = (l: string) => (l === 'nl' ? 'nl' : 'en');

export function useMe() {
  const client = useClient();
  const { signedIn } = useSession();
  return useQuery({ queryKey: ['me'], queryFn: () => client.me(), enabled: signedIn });
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

export function useAlerts(enabled = true) {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  return useQuery({
    queryKey: ['alerts', loc, locale],
    queryFn: () => client.alerts(loc!, locale),
    enabled: enabled && !!loc,
    refetchInterval: 15_000,
  });
}

/** Marks alerts read (or all of them without ids); the list shows it at once. */
export function useMarkAlertsRead() {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  const qc = useQueryClient();
  const key = ['alerts', loc, locale];
  return useMutation({
    mutationFn: (ids?: string[]) => client.markAlertsRead(loc!, locale, ids),
    onMutate: (ids) => {
      qc.setQueryData<AlertResponse[]>(key, (old) =>
        old?.map((a) => (!ids || ids.includes(a.id) ? { ...a, read: true } : a)),
      );
    },
    onSuccess: (alerts) => qc.setQueryData(key, alerts),
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
  | { kind: 'order'; seat: number; dishId: string; note?: string; choices?: Choice[] }
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
      if (w.kind === 'order') return client.order(loc, label, w.seat, w.dishId, w.note, w.choices);
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

/** The kitchen display: refreshes often, so new plates and allergy changes show quickly. */
export function useKitchen() {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  return useQuery({
    queryKey: ['kitchen', loc, locale],
    queryFn: () => client.kitchen.tickets(loc!, locale),
    enabled: !!loc,
    refetchInterval: 5_000,
  });
}

export type KitchenAction =
  | { kind: 'check'; plateId: string; checked: string[] }
  | { kind: 'reject'; plateId: string; reason: string }
  | { kind: 'override'; plateId: string; reason: string }
  | { kind: 'passCheck'; plateId: string }
  | { kind: 'serve'; plateId: string }
  | { kind: 'reprint'; plateId: string };

/** A step on a plate. The tickets, tables and alerts reload after, also when it fails. */
export function useKitchenAction() {
  const client = useClient();
  const loc = useLocationId();
  const locale = lang(useTranslation().i18n.language);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: KitchenAction) => {
      if (!loc) throw new Error('No location');
      const k = client.kitchen;
      if (a.kind === 'check') return k.check(loc, a.plateId, a.checked, locale);
      if (a.kind === 'reject') return k.reject(loc, a.plateId, a.reason);
      if (a.kind === 'override') return k.override(loc, a.plateId, a.reason, locale);
      if (a.kind === 'passCheck') return k.passCheck(loc, a.plateId);
      if (a.kind === 'reprint') return k.reprint(loc, a.plateId);
      return k.serve(loc, a.plateId);
    },
    onSettled: () =>
      Promise.all(
        ['kitchen', 'table', 'alerts', 'floors'].map((key) =>
          qc.invalidateQueries({ queryKey: [key, loc] }),
        ),
      ),
  });
}
