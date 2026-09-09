# Browser-Native AI Video Studio — visual truth

## Design read

Focused production tool for video makers, with a restrained dark navigation rail and a light work canvas. The visual language is calm, precise, and operational: clear hierarchy, compact density, one accent, and explicit status colors.

## Tokens and rules

- Source of truth: `packages/renderer/src/styles.css`.
- Use the shared `--ui-space-*`, `--ui-radius-*`, and `--ui-control-height*` tokens.
- Keep the existing Lucide icon family; do not mix icon libraries casually.
- Use one accent blue plus semantic green/amber/red states. Avoid decorative gradients and generic AI-purple treatments.
- Preserve visible loading, empty, error, disabled, and success states.
- Prefer grouped sections and dividers over adding another card or another button.

## Quality gate

Before shipping a UI change, inspect desktop and narrow layouts, check CTA contrast and duplicate intent, then run typecheck and unit tests.
