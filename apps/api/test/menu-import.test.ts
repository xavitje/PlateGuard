import { describe, expect, it } from 'vitest';
import { MenuImportService } from '../src/modules/recipes/menu-import.service.js';

describe('menu import', () => {
  it('says it is not set up when the server has no API key', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      new MenuImportService().extract({ files: [{ mediaType: 'image/png', data: 'x' }] }, ['MILK']),
    ).rejects.toMatchObject({ response: { code: 'MENU_IMPORT_NOT_CONFIGURED' }, status: 503 });
    if (key) process.env.ANTHROPIC_API_KEY = key;
  });
});
