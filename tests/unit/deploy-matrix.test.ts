import { describe, expect, it } from 'vitest';
import { deployMatrix, type MatrixInput } from '../../src/lib/deploy-matrix.ts';

const CLIENTS = ['lacabana', 'otro'];
const AUTO = JSON.stringify({ lacabana: 'production', otro: 'staging' });

const plan = (input: Partial<MatrixInput>) =>
  deployMatrix({ event: 'schedule', clients: CLIENTS, autoTargets: AUTO, ...input });

describe('deployMatrix (qué hotel se publica y dónde)', () => {
  it('manual: el hotel y el destino elegidos, con su Environment', () => {
    expect(plan({ event: 'workflow_dispatch', client: 'otro', target: 'production' })).toEqual([
      { client: 'otro', target: 'production', environment: 'otro-production' },
    ]);
  });

  it('manual: funciona aunque el hotel aún no tenga despliegues automáticos', () => {
    expect(
      plan({ event: 'workflow_dispatch', client: 'otro', target: 'staging', autoTargets: '' }),
    ).toEqual([{ client: 'otro', target: 'staging', environment: 'otro-staging' }]);
  });

  it('manual: rechaza un hotel o un destino desconocidos', () => {
    expect(() => plan({ event: 'workflow_dispatch', client: 'nadie', target: 'staging' })).toThrow(
      /«nadie».*lacabana, otro/,
    );
    expect(() => plan({ event: 'workflow_dispatch', client: 'otro', target: 'prod' })).toThrow(
      /destino/,
    );
  });

  it('programado: cada hotel configurado a SU destino', () => {
    expect(plan({})).toEqual([
      { client: 'lacabana', target: 'production', environment: 'lacabana-production' },
      { client: 'otro', target: 'staging', environment: 'otro-staging' },
    ]);
  });

  it('push a main: el código nuevo va al staging de cada hotel configurado, nunca a producción', () => {
    expect(plan({ event: 'push' }).map((job) => job.environment)).toEqual([
      'lacabana-staging',
      'otro-staging',
    ]);
  });

  it('aviso del PMS (repository_dispatch): solo el hotel que cambió, a su destino', () => {
    expect(plan({ event: 'repository_dispatch', payloadClient: 'lacabana' })).toEqual([
      { client: 'lacabana', target: 'production', environment: 'lacabana-production' },
    ]);
    // Sin hotel en el aviso: todos, como el programado.
    expect(plan({ event: 'repository_dispatch' })).toHaveLength(2);
    // Un hotel sin despliegue automático, o desconocido, no publica nada.
    expect(
      plan({
        event: 'repository_dispatch',
        payloadClient: 'otro',
        autoTargets: '{"lacabana":"production"}',
      }),
    ).toEqual([]);
    expect(plan({ event: 'repository_dispatch', payloadClient: '../x' })).toEqual([]);
  });

  it('sin AUTO_TARGETS no hay despliegues automáticos (aún no hay secretos)', () => {
    for (const autoTargets of [undefined, '', '  ', '{}']) {
      expect(plan({ autoTargets })).toEqual([]);
      expect(plan({ event: 'push', autoTargets })).toEqual([]);
    }
  });

  it('AUTO_TARGETS mal escrito falla con un mensaje claro (no publica a ciegas)', () => {
    expect(() => plan({ autoTargets: 'lacabana=production' })).toThrow(/AUTO_TARGETS.*JSON/);
    expect(() => plan({ autoTargets: '["lacabana"]' })).toThrow(/AUTO_TARGETS/);
    expect(() => plan({ autoTargets: '{"nadie":"staging"}' })).toThrow(/«nadie»/);
    expect(() => plan({ autoTargets: '{"otro":"prod"}' })).toThrow(/destino/);
  });

  it('un evento desconocido no publica nada', () => {
    expect(plan({ event: 'pull_request' })).toEqual([]);
  });
});
