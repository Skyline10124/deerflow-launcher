/** DeerFlow 项目的版本要求（与主项目 scripts/check.py 和 pyproject.toml 对齐） */
export const VERSION_REQUIREMENTS = {
  python: { min: '3.12.0', display: '3.12' },
  node: { min: '22.0.0', display: '22' },
  pnpm: { min: '8.0.0', display: '8' },
  nginx: { min: '1.20.0', display: '1.20' },
} as const;
