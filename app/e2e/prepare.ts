import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Prepares the throwaway database and the seeded session, at config-load time.
 *
 * # Why not globalSetup
 *
 * The `webServer` entries in playwright.config.ts need the scoped connection
 * string in their `env`, and that object is evaluated when the config module is
 * loaded. Playwright does not promise `globalSetup` runs before a webServer
 * starts, so putting schema creation there is a race that fails intermittently
 * — the worst kind of test infrastructure. Importing this from the config makes
 * the ordering a language guarantee.
 *
 * # Why the main process is told apart from the workers
 *
 * Playwright loads the config in EVERY worker as well as in the main process.
 * The first version of this file dropped and recreated the schema on every
 * load, so a worker starting up destroyed the tables the server had just
 * migrated — and the symptom was `relation "users" does not exist` in a test
 * that had done nothing wrong.
 *
 * `TEST_WORKER_INDEX` is set by Playwright in workers and not in the main
 * process, so it is the discriminator. The main process does the destructive
 * setup once and writes the state; workers read it.
 */

const PSQL = process.env.PSQL ?? '/usr/lib/postgresql/16/bin/psql';
const SCHEMA = 'nodeau_e2e';
const STATE_FILE = resolve(import.meta.dirname, '.e2e-state.json');

export interface E2EState {
  baseDSN: string;
  scopedDSN: string;
  schema: string;
  sessionToken: string;
  sessionHash: string;
}

export function prepare(): E2EState {
  const isWorker = process.env.TEST_WORKER_INDEX !== undefined;
  if (isWorker) return readState();

  const baseDSN = process.env.NODEAU_TEST_POSTGRES;
  if (!baseDSN) {
    throw new Error(
      'NODEAU_TEST_POSTGRES is not set. Start a throwaway PostgreSQL with\n' +
        '  eval "$(../../nodeforge/scripts/dev-postgres.sh start)"\n' +
        'and run the browser tests again. No root is required.',
    );
  }
  if (!existsSync(PSQL)) {
    throw new Error(`psql not found at ${PSQL}; set PSQL to its location`);
  }
  requireGo();

  // Dropped and recreated so a run never inherits state from the previous one.
  // Only here, in the main process.
  run(baseDSN, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`, 'public');
  run(baseDSN, `CREATE SCHEMA ${SCHEMA}`, 'public');

  const sessionToken = randomBytes(32).toString('base64url');
  const state: E2EState = {
    baseDSN,
    // lib/pq passes an unrecognised DSN key to the server as a runtime
    // parameter, so the Go service is scoped by this. psql is NOT — see psql().
    scopedDSN: `${baseDSN} search_path=${SCHEMA}`,
    schema: SCHEMA,
    sessionToken,
    sessionHash: createHash('sha256').update(sessionToken).digest('hex'),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
  return state;
}

/**
 * requireGo fails with a sentence rather than an exit code.
 *
 * The browser tests build and run the real `nodeau-cloud` binary, so the Go
 * toolchain has to be on PATH. Without this the webServer dies with
 * `sh: 1: go: not found` and Playwright reports `Exit code: 127`, which says
 * nothing about what to do — and the Go toolchain here is user-local, so
 * "it works in my shell" is the normal way to hit it.
 */
function requireGo(): void {
  try {
    execFileSync('go', ['version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'The Go toolchain is not on PATH, and the browser tests build and run the ' +
        'real nodeau-cloud binary.\n' +
        '  export PATH="$HOME/.local/go/bin:$PATH"\n' +
        'then run the browser tests again.',
    );
  }
}

function readState(): E2EState {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      `${STATE_FILE} is missing. A Playwright worker loaded the config without the ` +
        'main process having prepared the database first, which should not be possible.',
    );
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState;
}

/**
 * psql runs one statement against the test schema.
 *
 * The schema goes through PGOPTIONS, not the connection string, and the two are
 * not interchangeable: lib/pq forwards an unknown DSN key to the server as a
 * runtime parameter, so `search_path=` in a DSN works for the Go service — but
 * libpq validates its keys and psql rejects the same string with
 * `invalid connection option "search_path"`. One connection string, two
 * clients, different rules. This test found it.
 */
export function psql(dsn: string, statement: string): string {
  return run(dsn, statement, searchPathOf(dsn) ?? SCHEMA);
}

function run(dsn: string, statement: string, schema: string): string {
  return execFileSync(
    PSQL,
    [stripSearchPath(dsn), '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-q', '-c', statement],
    {
      encoding: 'utf8',
      env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` },
    },
  ).trim();
}

const searchPathPattern = /\s*search_path=(\S+)/;

function searchPathOf(dsn: string): string | undefined {
  return searchPathPattern.exec(dsn)?.[1];
}

function stripSearchPath(dsn: string): string {
  return dsn.replace(searchPathPattern, '').trim();
}
