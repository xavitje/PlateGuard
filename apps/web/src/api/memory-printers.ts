import type { PrinterSummary } from '@plateguard/contracts';
import { ApiError, type AdminClient } from './client';

type PrinterAdmin = Pick<
  AdminClient,
  'printers' | 'addPrinter' | 'newPrinterKey' | 'testPrinter' | 'removePrinter'
>;

/** Kitchen printers for the demo and tests. Nothing prints: tickets only count as waiting. */
export function createMemoryPrinters(): { printers: PrinterSummary[]; admin: PrinterAdmin } {
  const printers: PrinterSummary[] = [];
  let next = 1;
  const list = () => ({ printers: structuredClone(printers) });
  const find = (id: string) => {
    const p = printers.find((x) => x.id === id);
    if (!p) throw new ApiError(404, 'PRINTER_NOT_FOUND');
    return p;
  };
  const address = (id: string) => ({
    printerId: id,
    path: `/hooks/cloudprnt/${id}/demo-key-${next++}`,
    ...list(),
  });
  return {
    printers,
    admin: {
      printers: async () => list(),
      addPrinter: async (_, body) => {
        const id = `printer-${next++}`;
        printers.push({
          id,
          name: body.name,
          lastSeenAt: null,
          online: false,
          fault: false,
          waiting: 0,
        });
        return address(id);
      },
      newPrinterKey: async (_, id) => {
        find(id).lastSeenAt = null;
        find(id).online = false;
        return address(id);
      },
      testPrinter: async (_, id) => {
        find(id).waiting++;
      },
      removePrinter: async (_, id) => {
        printers.splice(printers.indexOf(find(id)), 1);
        return list();
      },
    },
  };
}
