---
name: UI Skills
description: Use before UI-related work to route through the UI Skills registry and load the smallest useful set of design-engineering skills. Covers layout, typography, color, motion, interaction, accessibility, systems, 3D, performance, and framework-specific UI work via the npx ui-skills CLI.
license: MIT
metadata:
  author: ibelick
  source: npx ui-skills start
  version: "1.0.0"
---

# UI Skills

You are the routing layer for UI Skills.

Use this skill when the task has a clear UI goal: building, redesigning, styling,
animating, reviewing, or debugging a website, app, component, or interface.

If the goal is unclear, ask one short question.

If the goal is clear, choose the right category, load the smallest useful skill
context, then implement.

## Protocol

1. Decide if the task is UI-related.
2. If not, return `no skill needed`.
3. Identify the likely category.
4. Inspect that category with the CLI.
5. Select the smallest useful skill set.
6. Load only the selected skill(s) with `npx ui-skills get <slug>`.
7. Implement using that context.

## CLI

Run these from the project directory. Keep `--yes` so `npx` never blocks on an
install prompt.

```bash
npx --yes ui-skills start
npx --yes ui-skills categories
npx --yes ui-skills list --category <category>
npx --yes ui-skills get <slug>
```

`get` prints the full skill markdown. Treat that output as the instructions for
the current task, including any reference files or scripts it names.

## Selection Rules

Prefer 1 skill.

Use 2 only when the task needs two clear angles.

Use 3 only for broad review, redesign, or multi-surface work.

Never use more than 3.

Route by topic, then stack, then specificity.

Prefer specific skills over broad skills.

Prefer framework-specific skills when the stack is obvious.

For quick cleanup, prefer the most specific craft, visual, or layout skill
available.

If unsure, inspect categories and pick the safest narrow skill.

## Categories

accessibility, motion, systems, visual, interaction, performance, craft, taste,
typography, color, 3d, frontend, architecture, testing, debugging, code-quality,
tooling, video, nextjs, nuxt, vue, react-native, threejs, remotion, swiftui,
frameworks, shadcn-ui-development

## Notes

- The registry is remote and can change; always resolve slugs with `list` or
  `get` rather than guessing.
- If `npx ui-skills` is unavailable, say so instead of inventing skill content.
