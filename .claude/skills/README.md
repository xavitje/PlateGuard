# Design skills

Agent skills for Claude Code sessions in this repo. Claude picks them up automatically from
`.claude/skills/`; you can also call one by name, for example `/impeccable polish` or
`/frontend-design`.

Vendored as-is from their official public repositories (not edited), with each upstream licence
kept next to the skill.

| Skill folder | What it is for | Source (commit) | Licence |
| --- | --- | --- | --- |
| `frontend-design` | Anthropic's art-direction skill: distinctive type, layout and hierarchy instead of templated defaults | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (`e4bb5d9`) | Apache 2.0 |
| `design-taste-frontend` | Taste Skill: anti-"AI slop" rules for layout, colour, type and motion | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (`d1a2bb4`) | MIT |
| `impeccable` | Refine an existing UI: `critique`, `audit`, `polish`, `distill`, `typeset`, `quieter`, `layout`, `animate` … | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (`9e460a8`) | Apache 2.0 |
| `ui-ux-pro-max` | UI/UX Pro Max: searchable data on styles, palettes, font pairings, UX rules and stacks | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`b73ee96`) | MIT |
| `web-design-guidelines` | Vercel: audit UI against the Web Interface Guidelines (accessibility, forms, focus, motion…) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`5a37a63`) | MIT |
| `react-best-practices`, `composition-patterns`, `react-view-transitions` | Vercel: React performance, component composition, view transitions | same | MIT |
| `gsap-core`, `gsap-react`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-utils`, `gsap-performance`, `gsap-frameworks` | Official GSAP skills for intentional motion | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) (`aed9cfd`) | MIT |

## Not vendored

- **Taste Skill image assets** (`assets/`, ~38 MB of stock photos and demo files for marketing
  sites) are left out to keep the repo small. PlateGuard is an app, not a landing page, so they
  are not needed. Install the full skill with `npx skills add Leonxlnx/taste-skill` if you want
  them.
- **Figma skills** come from [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide),
  which has no licence file, so they are not copied here. Instead `.claude/settings.json` enables
  Figma's official Claude Code plugin (`figma@claude-plugins-official`), which ships the Figma
  MCP server plus its skills (design-to-code, token sync, library generation…). Claude Code asks
  to install it the first time you open the repo; sign in to Figma when prompted.
- **Motion (motion.dev)** has no official public agent skill that we could find, so none is
  included. The GSAP skills above cover animation; the app itself uses plain CSS transitions.

## Updating

Re-clone the source repo and copy the skill folder over the old one. Keep the licence file.
