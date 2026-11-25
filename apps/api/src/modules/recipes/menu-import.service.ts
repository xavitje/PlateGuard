import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MenuImportInput, MenuImportProposal } from '@plateguard/contracts';
import { z } from 'zod';

const PROMPT = `These are photos or a PDF of a restaurant menu. Read every dish on it.

For each dish:
- name: exactly as written on the menu, in the menu's language.
- category: the menu section it is under (for example "Voorgerechten"), or null.
- priceCents: the price in euro cents, or null when there is none.
- description: the menu text under the dish, or null.
- components: the parts a cook plates separately (for example "steak", "fries", "pepper sauce"),
  each with its likely ingredients. Use the menu text first; fill in what a typical recipe for
  this dish uses. Keep ingredient names short and generic ("butter", "wheat flour").
- For each ingredient, the allergens it contains and may contain, using only the codes given.
  When unsure whether an ingredient contains an allergen, list it under contains: a kitchen will
  check every allergen by hand, and a missed allergen is worse than an extra one.

Skip drinks unless the menu is only drinks. Do not invent dishes that are not on the menu.`;

/** Turns a photo or PDF of a menu into dishes for the owner to check. Saves nothing. */
@Injectable()
export class MenuImportService {
  async extract(input: MenuImportInput, allergenCodes: string[]): Promise<MenuImportProposal> {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new ServiceUnavailableException({ code: 'MENU_IMPORT_NOT_CONFIGURED' });
    const codes = z.enum(allergenCodes as [string, ...string[]]);
    const Output = z.object({
      dishes: z.array(
        z.object({
          name: z.string(),
          category: z.string().nullable(),
          priceCents: z.number().int().nullable(),
          description: z.string().nullable(),
          components: z.array(
            z.object({
              name: z.string(),
              ingredients: z.array(
                z.object({
                  name: z.string(),
                  contains: z.array(codes),
                  mayContain: z.array(codes),
                }),
              ),
            }),
          ),
        }),
      ),
    });
    const client = new Anthropic();
    // Streamed: a long menu can take minutes, past the SDK's non-streaming timeout guard.
    const message = await client.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        output_config: { effort: 'low', format: zodOutputFormat(Output) },
        messages: [
          {
            role: 'user',
            content: [
              ...input.files.map((f) =>
                f.mediaType === 'application/pdf'
                  ? ({
                      type: 'document',
                      source: { type: 'base64', media_type: f.mediaType, data: f.data },
                    } as const)
                  : ({
                      type: 'image',
                      source: { type: 'base64', media_type: f.mediaType, data: f.data },
                    } as const),
              ),
              { type: 'text', text: `${PROMPT}\n\nAllergen codes: ${allergenCodes.join(', ')}` },
            ],
          },
        ],
      })
      .finalMessage()
      .catch((e: unknown) => {
        if (e instanceof Anthropic.APIError)
          throw new UnprocessableEntityException({
            code: 'MENU_IMPORT_FAILED',
            details: { status: e.status },
          });
        throw e;
      });
    const text = message.content.find((b) => b.type === 'text')?.text;
    const parsed =
      message.stop_reason === 'end_turn' && text ? Output.safeParse(JSON.parse(text)) : null;
    if (!parsed?.success)
      throw new UnprocessableEntityException({
        code: 'MENU_IMPORT_FAILED',
        details: { stopReason: message.stop_reason },
      });
    return { dishes: parsed.data.dishes.map(tidy).filter((d) => d.name && d.components.length) };
  }
}

/** Fits the AI's answer to what the recipe forms accept (names up to 120 characters). */
function tidy(d: MenuImportProposal['dishes'][number]) {
  const cut = (s: string) => s.trim().slice(0, 120);
  return {
    name: cut(d.name),
    category: d.category ? cut(d.category) || null : null,
    priceCents:
      d.priceCents !== null && d.priceCents >= 0 && d.priceCents <= 1_000_000 ? d.priceCents : null,
    description: d.description?.trim() || null,
    components: d.components
      .map((c) => ({
        name: cut(c.name),
        ingredients: c.ingredients
          .map((i) => ({
            name: cut(i.name),
            contains: [...new Set(i.contains)],
            mayContain: [...new Set(i.mayContain)],
          }))
          .filter((i) => i.name),
      }))
      .filter((c) => c.name)
      .slice(0, 30),
  };
}
