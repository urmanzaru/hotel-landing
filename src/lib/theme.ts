/**
 * Sobrescrituras de tokens por cliente (`clients/<slug>.config.ts → theme`) como un bloque `:root { ... }`.
 * Los nombres y valores se validan: aunque la config es de confianza, el CSS se inyecta como texto en el <head>.
 */

const TOKEN_NAME = /^--[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Sin `;`, llaves, `<`, `>`, `\`, `@` ni `url(`/`expression(`: solo valores de tokens (colores, medidas, fuentes). */
const SAFE_VALUE = /^[^;{}<>\\@]+$/;
const FORBIDDEN_FUNCTION = /(?:url|expression|image-set|src)\s*\(/i;

export function themeCss(theme: Record<string, string>): string {
  const declarations = Object.entries(theme).map(([name, value]) => {
    if (!TOKEN_NAME.test(name)) throw new Error(`Nombre de token no válido: "${name}"`);
    const trimmed = value.trim();
    if (!trimmed || !SAFE_VALUE.test(trimmed) || FORBIDDEN_FUNCTION.test(trimmed)) {
      throw new Error(`Valor no válido para el token ${name}: "${value}"`);
    }
    return `  ${name}: ${trimmed};`;
  });
  return declarations.length > 0 ? `:root {\n${declarations.join('\n')}\n}` : '';
}
