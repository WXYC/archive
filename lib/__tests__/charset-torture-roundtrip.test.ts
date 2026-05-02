/**
 * Charset-torture round-trip CI for the archive app's serialize/deserialize
 * surfaces.
 *
 * Implements WX-1.2.12 (Mojibake Prevention M2). Drives the cross-repo
 * `@wxyc/shared` corpus from `tests/fixtures/charset-torture.json` (pinned
 * via `charset-torture.json.sha256`; drift-guarded by the M3.2 workflow at
 * `.github/workflows/charset-corpus-drift.yml`).
 *
 * Two surfaces:
 *
 *  - **JWT payload** — sign each entry as a JWS claim with a locally-generated
 *    key pair and verify+decode, asserting byte equality. Catches future
 *    regressions where a `jose` upgrade or a custom claim mapper silently
 *    re-encodes string claims.
 *  - **URL query** — round-trip each entry through a `URLSearchParams` value,
 *    mirroring the share-dialog's timestamp-link pattern. Catches any future
 *    encoding-cycle bug if the share-dialog grows annotation fields.
 */
import * as jose from "jose";
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

interface CharsetTortureEntry {
  category: string;
  input: string;
  expected_storage: string;
  expected_match_form: string | null;
  expected_ascii_form: string | null;
  notes: string;
}

interface CharsetTortureCorpus {
  meta: { description: string; version: number };
  categories: Record<string, Omit<CharsetTortureEntry, "category">[]>;
}

const corpusPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/charset-torture.json"
);
const corpus: CharsetTortureCorpus = JSON.parse(
  readFileSync(corpusPath, "utf-8")
);

const ENTRIES: CharsetTortureEntry[] = Object.entries(corpus.categories).flatMap(
  ([category, entries]) => entries.map((e) => ({ ...e, category }))
);

const entryId = (e: CharsetTortureEntry): string =>
  `${e.category}:${e.input.slice(0, 24).replace(/\n/g, "\\n")}`;

describe("charset-torture: jose JWT payload round-trip", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    const pair = await jose.generateKeyPair("ES256", { extractable: true });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
  });

  it.each(ENTRIES)(
    "round-trips $category entry through SignJWT/jwtVerify: $input",
    async (entry) => {
      const jwt = await new jose.SignJWT({ wxyc_value: entry.input })
        .setProtectedHeader({ alg: "ES256" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      const { payload } = await jose.jwtVerify(jwt, publicKey);
      expect(payload.wxyc_value, `${entry.category}: ${entry.notes}`).toBe(
        entry.input
      );
    }
  );
});

describe("charset-torture: URL query parameter round-trip", () => {
  it.each(ENTRIES)(
    "round-trips $category entry through URLSearchParams: $input",
    (entry) => {
      const url = new URL("https://archive.wxyc.org/share");
      url.searchParams.set("note", entry.input);

      const parsed = new URL(url.toString());
      expect(
        parsed.searchParams.get("note"),
        `${entry.category}: ${entry.notes}`
      ).toBe(entry.input);
    }
  );
});

describe("charset-torture: corpus shape sanity", () => {
  it("loads more than one category from the vendored fixture", () => {
    expect(Object.keys(corpus.categories).length).toBeGreaterThan(1);
  });

  it("exposes a stable, parametrize-friendly id for every entry", () => {
    const ids = ENTRIES.map(entryId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
