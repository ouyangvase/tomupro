# Design Libraries

This file records design libraries installed or registered for TomuPro UI work.

## Installed Packages

- `liquid-glass-react`
  - Source: https://github.com/rdev/liquid-glass-react
  - Note: The package declares React 19 peer dependencies. TomuPro currently uses React 18, so import it only after testing the target component in isolation.

- `awesome-design-md`
  - Source: https://github.com/voltagent/awesome-design-md
  - Usage: `npx awesome-design-md`

## Local Components

- `LiquidEffectAnimation`
  - Source: https://github.com/StarKnightt/liquid-effect-animation
  - Installed at: `src/components/ui/liquid-effect-animation.tsx`
  - Note: Installed using the repository's recommended shadcn-style copy approach instead of adding the whole Next.js/React 19 demo app as a dependency.

## External References

- Uiverse Galaxy
  - Source: https://github.com/uiverse-io/galaxy
  - Note: This repository is a large MIT-licensed archive of UI snippets, not an npm package. Copy individual elements into TomuPro only after reviewing markup, CSS, responsiveness, accessibility, and fit with the TomuPro design system.
