/** The management figures for a period, for one location or added up for the group. */
export interface DashboardFigures {
  /** Plates ordered for a guest with allergies (taken off the order not counted). */
  flagged: number;
  /** Of those, by the engine's outcome when ordered. */
  outcomes: Record<string, number>;
  /** Sent back by the kitchen. */
  rejected: number;
  served: number;
  /** Served, or left on a closed visit, without the cook's check. */
  noKitchenCheck: number;
  /** Served without the runner's check, where the pass check is on; null where it is off. */
  noPassCheck: number | null;
  /** Plates the engine could not judge (UNKNOWN). */
  unknown: number;
  /** Allergies typed as free text, not in the recipe data: checked by hand. */
  customAllergies: number;
  /** Median minutes from ordering to the cook's check. */
  checkMinutes: number | null;
  /** Median minutes from ordering to served. */
  serveMinutes: number | null;
  incidents: number;
  openIncidents: number;
}

export interface DashboardLocation extends DashboardFigures {
  id: string;
  name: string;
}

export interface DashboardResponse {
  from: string;
  to: string;
  days: number;
  /** Every location this user may see the dashboard of; one for a single restaurant. */
  locations: DashboardLocation[];
  total: DashboardFigures;
  /** The free-text allergies asked most, over all those locations. */
  unknownItems: { label: string; count: number }[];
}
