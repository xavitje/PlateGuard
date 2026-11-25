import type { AnyAdapter, Capability, Connection } from './ports.js';

/**
 * Every adapter registers here. A new POS, KDS or printer is a new folder under adapters/
 * plus one register() call, behind a feature flag per organization.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, AnyAdapter>();

  register(adapter: AnyAdapter): this {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Adapter ${adapter.provider} is already registered`);
    }
    this.adapters.set(adapter.provider, adapter);
    return this;
  }

  get(provider: string): AnyAdapter | undefined {
    return this.adapters.get(provider);
  }

  providers(): string[] {
    return [...this.adapters.keys()].sort();
  }

  /**
   * The first of a location's connections whose adapter reports the capability.
   * The fallback (app entry instead of POS allergies, printer instead of KDS) follows from this,
   * not from special code.
   */
  async findCapable(
    connections: Connection[],
    capability: Capability,
  ): Promise<{ adapter: AnyAdapter; connection: Connection } | null> {
    for (const connection of connections) {
      const adapter = this.adapters.get(connection.provider);
      if (adapter && (await adapter.capabilities(connection)).includes(capability)) {
        return { adapter, connection };
      }
    }
    return null;
  }
}
