import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Does this TypeScript client still match the Go wire contract?
 *
 * # Why a text check against Go source rather than code generation
 *
 * `pkg/cloudapi` is the source of truth, and `src/lib/api.ts` is a
 * hand-maintained mirror. A generator would remove the drift entirely, at the
 * cost of a build step in two repositories, a committed artifact and a
 * regeneration ritual — more machinery than a dozen interfaces justify.
 *
 * What actually goes wrong without any check is narrow and specific: somebody
 * adds a field to the Go DTO and the UI silently never shows it. So the check
 * is equally narrow — every `json:"..."` tag on the response types this client
 * consumes must appear as a key in api.ts.
 *
 * # It SKIPS when the platform repository is not beside this one
 *
 * The two live in separate repositories (ADR-P7-005 §2), so on Netlify only
 * this one is checked out. Skipping there is correct: the check runs on a
 * developer's machine and in any CI that has both, and a test that failed
 * because a sibling directory was absent would be a test people delete.
 */

const PLATFORM_REPO =
  process.env.NODEAU_PLATFORM_REPO ?? resolve(import.meta.dirname, '../../../nodeforge');
const CONTRACT = resolve(PLATFORM_REPO, 'pkg/cloudapi/cloudapi.go');

const available = existsSync(CONTRACT);
const describeIfAvailable = available ? describe : describe.skip;

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    `contract test skipped: ${CONTRACT} not found. ` +
      'Set NODEAU_PLATFORM_REPO to the Nodeau platform checkout to run it.',
  );
}

describeIfAvailable('the TypeScript client matches pkg/cloudapi', () => {
  const goSource = available ? readFileSync(CONTRACT, 'utf8') : '';
  const tsSource = readFileSync(resolve(import.meta.dirname, '../src/lib/api.ts'), 'utf8');

  /** goStructFields extracts the json tag names from one Go struct. */
  function goStructFields(structName: string): string[] {
    const start = goSource.indexOf(`type ${structName} struct {`);
    if (start < 0) throw new Error(`no Go type named ${structName}`);
    const end = goSource.indexOf('\n}', start);
    const body = goSource.slice(start, end);

    const fields: string[] = [];
    for (const match of body.matchAll(/json:"([^"]+)"/g)) {
      const name = match[1]?.split(',')[0];
      // `-` means the field is deliberately not on the wire.
      if (name && name !== '-') fields.push(name);
    }
    return fields;
  }

  // The response types THIS CLIENT reads.
  //
  // Deliberately not every response type in the Go package. Three of them —
  // ActivationStartResponse, ActivationPollResponse and RefreshResponse — are
  // the CLI's half of the contract and the browser never calls those endpoints:
  // starting an activation, polling it and refreshing an entitlement are all
  // things a machine does. Listing them here was the first draft, and this test
  // caught it, which is a fair demonstration that it works. Their parity is
  // covered where it belongs, by the Go end-to-end test that runs the real CLI.
  //
  // Request types are also absent: the client CONSTRUCTS those, so a missing
  // field is a type error rather than a silent gap.
  const responseTypes = [
    'Error',
    'User',
    'Organization',
    'Me',
    'Plan',
    'AvailablePlan',
    'Installation',
    'ActivationPendingView',
  ];

  for (const typeName of responseTypes) {
    it(`${typeName} has every field the Go type sends`, () => {
      const missing = goStructFields(typeName).filter(
        (field) => !new RegExp(`\\b${field}\\??:`).test(tsSource),
      );
      expect(
        missing,
        `pkg/cloudapi.${typeName} has field(s) that src/lib/api.ts does not mention. ` +
          'Either add them, or — if the UI genuinely does not need them — this list is ' +
          'the place to say so explicitly rather than leaving the omission silent.',
      ).toEqual([]);
    });
  }

  it('declares every error code the Go package defines', () => {
    // A code the frontend has never heard of falls through to a generic
    // message, which is survivable — but the union type is what lets a
    // `switch` be exhaustive, and an out-of-date union quietly stops helping.
    const goCodes = [...goSource.matchAll(/ErrorCode = "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(goCodes.length).toBeGreaterThan(5);

    const missing = goCodes.filter((code) => !tsSource.includes(`'${code}'`));
    expect(missing, 'error codes defined in Go and missing from the TypeScript union').toEqual(
      [],
    );
  });

  it('uses the same CSRF header name the server requires', () => {
    const match = goSource.match(/CSRFHeader = "([^"]+)"/);
    expect(match?.[1]).toBeTruthy();
    expect(tsSource).toContain(`'${match?.[1]}'`);
  });
});
