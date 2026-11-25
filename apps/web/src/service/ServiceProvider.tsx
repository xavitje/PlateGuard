import type { GuestAllergy } from '@plateguard/domain';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEMO_DISHES, DEMO_SERVICE } from '../demo';
import { orderAlerts, type OrderAlert } from './alerts';
import { EMPTY_SEAT, type SeatState, type ServiceState } from './state';

interface ServiceApi {
  state: ServiceState;
  alerts: OrderAlert[];
  seat: (table: string, seat: number) => SeatState;
  setAllergies: (table: string, seat: number, allergies: GuestAllergy[]) => void;
  toggleNoAllergy: (table: string, seat: number) => void;
  order: (table: string, seat: number, dishId: string) => void;
  cancelOrder: (table: string, seat: number, orderId: string) => void;
}

const ServiceContext = createContext<ServiceApi | null>(null);

/**
 * Service state for the app shell: allergies and orders per seat. Held in memory on demo data
 * until the API serves it; alerts are derived from the orders, so they can never drift apart.
 */
export function ServiceProvider({
  children,
  initial = DEMO_SERVICE,
}: {
  children: ReactNode;
  initial?: ServiceState;
}) {
  const [state, setState] = useState<ServiceState>(initial);
  const nextId = useRef(1);

  const api = useMemo<ServiceApi>(() => {
    const patch = (table: string, seat: number, fn: (s: SeatState) => SeatState) =>
      setState((prev) => ({
        ...prev,
        [table]: { ...prev[table], [seat]: fn(prev[table]?.[seat] ?? EMPTY_SEAT) },
      }));
    return {
      state,
      alerts: orderAlerts(state, DEMO_DISHES),
      seat: (table, seat) => state[table]?.[seat] ?? EMPTY_SEAT,
      setAllergies: (table, seat, allergies) =>
        patch(table, seat, (s) => ({ ...s, allergies, noAllergy: false })),
      toggleNoAllergy: (table, seat) =>
        patch(table, seat, (s) => ({ ...s, noAllergy: !s.noAllergy })),
      order: (table, seat, dishId) =>
        patch(table, seat, (s) => ({
          ...s,
          orders: [...s.orders, { id: `new-${nextId.current++}`, dishId }],
        })),
      cancelOrder: (table, seat, orderId) =>
        patch(table, seat, (s) => ({ ...s, orders: s.orders.filter((o) => o.id !== orderId) })),
    };
  }, [state]);

  return <ServiceContext.Provider value={api}>{children}</ServiceContext.Provider>;
}

export function useService(): ServiceApi {
  const api = useContext(ServiceContext);
  if (!api) throw new Error('useService needs a ServiceProvider');
  return api;
}
