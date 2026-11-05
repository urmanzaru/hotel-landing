/**
 * Qué hotel se publica y dónde en cada ejecución de `deploy.yml` (playbook 09: un repositorio, varios hoteles).
 * Cada par hotel/destino es un Environment de GitHub `<hotel>-<destino>` con sus propios secretos y variables.
 *
 * - Manual (`workflow_dispatch`): el hotel y el destino elegidos.
 * - Programado (`schedule`): cada hotel de `AUTO_TARGETS` a su destino.
 * - `push` a `main`: cada hotel de `AUTO_TARGETS` a su **staging** (el código nuevo no llega solo a producción).
 * - Aviso del PMS (`repository_dispatch`, `pms-content-updated`): el hotel de `client_payload.client` (o todos si no
 *   viene) a su destino, solo si está en `AUTO_TARGETS`.
 *
 * `AUTO_TARGETS` es una variable del repositorio con JSON: `{"lacabana":"production","otro":"staging"}`. Vacía = sin
 * despliegues automáticos (antes de tener los secretos).
 */
export const TARGETS = ['staging', 'production'] as const;
export type Target = (typeof TARGETS)[number];

export interface DeployJob {
  client: string;
  target: Target;
  environment: string;
}

export interface MatrixInput {
  event: string;
  /** Slugs de `clients/`. */
  clients: readonly string[];
  autoTargets?: string | undefined;
  /** Solo en manual. */
  client?: string | undefined;
  target?: string | undefined;
  /** Solo en `repository_dispatch`. */
  payloadClient?: string | undefined;
}

function checkClient(client: string, clients: readonly string[]): string {
  if (!clients.includes(client)) {
    throw new Error(
      `El hotel «${client}» no existe en clients/. Disponibles: ${clients.join(', ')}`,
    );
  }
  return client;
}

function checkTarget(target: string, where: string): Target {
  if (!(TARGETS as readonly string[]).includes(target)) {
    throw new Error(`${where}: destino «${target}» no válido (usa ${TARGETS.join(' o ')})`);
  }
  return target as Target;
}

const job = (client: string, target: Target): DeployJob => ({
  client,
  target,
  environment: `${client}-${target}`,
});

function parseAutoTargets(raw: string | undefined, clients: readonly string[]): DeployJob[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AUTO_TARGETS no es JSON válido; ejemplo: {"lacabana":"production"}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `AUTO_TARGETS debe ser un objeto JSON hotel → destino; ejemplo: {"lacabana":"staging"}`,
    );
  }
  return Object.entries(parsed).map(([client, target]) =>
    job(checkClient(client, clients), checkTarget(String(target), `AUTO_TARGETS.${client}`)),
  );
}

export function deployMatrix(input: MatrixInput): DeployJob[] {
  if (input.event === 'workflow_dispatch') {
    return [
      job(
        checkClient(input.client?.trim() ?? '', input.clients),
        checkTarget(input.target?.trim() ?? '', 'Despliegue manual'),
      ),
    ];
  }
  const auto = parseAutoTargets(input.autoTargets, input.clients);
  switch (input.event) {
    case 'schedule':
      return auto;
    case 'push':
      return auto.map(({ client }) => job(client, 'staging'));
    case 'repository_dispatch': {
      const only = input.payloadClient?.trim();
      return only ? auto.filter(({ client }) => client === only) : auto;
    }
    default:
      return [];
  }
}
