import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../../clients/index.ts';
import { contrastRatio, parseHexTokens } from '../../src/lib/contrast.ts';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const tokens = parseHexTokens(css);

/**
 * Paletas a revisar: la base y la de cada cliente que cambia colores (`theme`, playbook 09): un hotel nuevo con un
 * color de marca ilegible no pasa.
 */
const PALETTES: [name: string, palette: Record<string, string>][] = [
  ['base (tokens.css)', tokens],
  ...CLIENTS.filter((client) =>
    Object.keys(client.theme).some((key) => key.startsWith('--color-')),
  ).map((client): [string, Record<string, string>] => [
    `cliente ${client.slug}`,
    { ...tokens, ...client.theme },
  ]),
];

const ratioOf = (palette: Record<string, string>, fg: string, bg: string): number => {
  const a = palette[fg];
  const b = palette[bg];
  if (!a || !b) throw new Error(`Token no encontrado: ${!a ? fg : bg}`);
  return contrastRatio(a, b);
};

/** WCAG 2.2 AA: texto normal ≥ 4.5:1. */
const TEXT_PAIRS: [fg: string, bg: string][] = [
  ['--color-text', '--color-surface'],
  ['--color-text', '--color-surface-raised'],
  ['--color-text', '--color-surface-sunken'],
  ['--color-text', '--color-cream'],
  ['--color-text-muted', '--color-surface'],
  ['--color-text-muted', '--color-surface-raised'],
  ['--color-text-muted', '--color-surface-sunken'],
  ['--color-text-muted', '--color-cream'],
  ['--color-brand', '--color-surface'],
  ['--color-brand', '--color-surface-raised'],
  ['--color-brand', '--color-surface-sunken'],
  ['--color-brand', '--color-cream'],
  ['--color-brand-strong', '--color-surface'],
  ['--color-text-on-brand', '--color-brand'],
  ['--color-text-on-brand', '--color-brand-strong'],
  ['--color-text-on-deep', '--color-deep'],
  ['--color-text-on-deep-muted', '--color-deep'],
  ['--color-sea', '--color-surface'],
  ['--color-sea', '--color-cream'],
  ['--color-sea', '--color-sea-soft'],
  ['--color-terracotta', '--color-surface'],
  ['--color-terracotta', '--color-surface-raised'],
  ['--color-terracotta', '--color-cream'],
  ['--color-terracotta', '--color-surface-sunken'],
  ['--color-sea', '--color-surface-raised'],
  ['--color-sea', '--color-surface-sunken'],
  ['--color-danger', '--color-surface-raised'],
  ['--color-danger', '--color-surface-sunken'],
  ['--color-success', '--color-surface-sunken'],
  ['--color-danger', '--color-surface'],
  ['--color-danger', '--color-danger-soft'],
  ['--color-success', '--color-surface'],
  ['--color-success', '--color-success-soft'],
];

/** WCAG 1.4.11: bordes de controles, iconos y anillo de foco ≥ 3:1. */
const UI_PAIRS: [fg: string, bg: string][] = [
  ['--color-border-strong', '--color-surface'],
  ['--color-border-strong', '--color-surface-raised'],
  ['--color-border-strong', '--color-surface-sunken'],
  ['--color-brand', '--color-surface'],
  ['--color-brand', '--color-cream'],
  ['--color-cream', '--color-deep'],
  ['--color-sea', '--color-surface'],
];

describe('contraste de los tokens de color', () => {
  it('lee los tokens hexadecimales de tokens.css', () => {
    expect(tokens['--color-brand']).toBe('#633222');
    expect(tokens['--color-cream']).toBe('#ffe6b1');
  });

  it.each(CLIENTS.map((client) => [client.slug, client.theme] as const))(
    'el tema de %s solo cambia colores con hex (para poder medir su contraste)',
    (_, theme) => {
      for (const [key, value] of Object.entries(theme)) {
        if (key.startsWith('--color-')) expect(value, key).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      }
    },
  );

  describe.each(PALETTES)('paleta %s', (_, palette) => {
    it.each(TEXT_PAIRS)('texto %s sobre %s ≥ 4.5:1', (fg, bg) => {
      expect(ratioOf(palette, fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(UI_PAIRS)('componente %s sobre %s ≥ 3:1', (fg, bg) => {
      expect(ratioOf(palette, fg, bg)).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('contrastRatio', () => {
  it('negro sobre blanco es 21:1 y es simétrico', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('acepta hex corto', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });

  it('rechaza valores que no son hex', () => {
    expect(() => contrastRatio('rojo', '#fff')).toThrow(/hex/i);
  });
});
