/** A small client for the Square REST API: only what the adapter uses, no SDK. */
export const SQUARE_VERSION = '2024-01-18';
export const SANDBOX_URL = 'https://connect.squareupsandbox.com';
export const PRODUCTION_URL = 'https://connect.squareup.com';

export class SquareApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(`Square ${status} ${code}: ${detail}`);
  }
}

export type Fetch = typeof fetch;

export class SquareApi {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly http: Fetch = fetch,
  ) {}

  async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      errors?: { code?: string; detail?: string }[];
    };
    if (!res.ok) {
      const e = json.errors?.[0];
      throw new SquareApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.detail ?? res.statusText);
    }
    return json as T;
  }
}
