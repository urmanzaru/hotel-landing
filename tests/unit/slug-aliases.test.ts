import { describe, expect, it } from 'vitest';
import { carrySlugAliases, roomRedirects } from '../../src/data/slug-aliases.ts';
import type { Snapshot } from '../../src/data/types.ts';

type Lite = Pick<Snapshot, 'dataSource' | 'roomTypes' | 'roomSlugAliases'>;
const snap = (
  rooms: [id: string, slug: string][],
  aliases: Record<string, string> = {},
  dataSource: Snapshot['dataSource'] = 'api',
): Lite =>
  ({
    dataSource,
    roomSlugAliases: aliases,
    roomTypes: rooms.map(([id, slug]) => ({ id, slug })),
  }) as Lite;

describe('alias de slugs de habitación (runbook «cambió el nombre de una habitación», playbook 09)', () => {
  it('sin snapshot anterior no hay alias', () => {
    expect(carrySlugAliases(null, snap([['a', 'doble']]))).toEqual({});
  });

  it('una habitación renombrada deja su slug anterior apuntando a su id', () => {
    const previous = snap([
      ['a', 'doble'],
      ['b', 'familiar'],
    ]);
    const next = snap([
      ['a', 'doble-vista-al-mar'],
      ['b', 'familiar'],
    ]);
    expect(carrySlugAliases(previous, next)).toEqual({ doble: 'a' });
  });

  it('los alias se conservan entre builds y siguen al nombre actual (a → b → c)', () => {
    const first = snap([['a', 'b']], { a: 'a' });
    const next = snap([['a', 'c']]);
    const aliases = carrySlugAliases(first, next);
    expect(aliases).toEqual({ a: 'a', b: 'a' });
    expect(roomRedirects({ ...next, roomSlugAliases: aliases })).toEqual([
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('se descarta el alias de una habitación que ya no existe o cuyo slug vuelve a estar en uso', () => {
    const previous = snap(
      [
        ['a', 'doble'],
        ['b', 'suite'],
      ],
      { vieja: 'z' },
    );
    const next = snap([
      ['a', 'doble-nueva'],
      ['c', 'doble'], // otra habitación ocupa el slug viejo: manda la página real
    ]);
    expect(carrySlugAliases(previous, next)).toEqual({});
  });

  it('un snapshot de muestra nunca aporta alias', () => {
    const previous = snap([['a', 'doble']], { otra: 'a' }, 'fixture');
    expect(carrySlugAliases(previous, snap([['a', 'doble-2']]))).toEqual({});
  });

  it('roomRedirects ignora alias rotos de un snapshot editado a mano', () => {
    expect(roomRedirects(snap([['a', 'doble']], { vieja: 'zzz', doble: 'a' }))).toEqual([]);
  });
});
