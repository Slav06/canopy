import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupMapillary,
  nearestCapture,
  safeThumbnail,
} from "../lib/mapillary";
import { seed } from "../lib/seed";
test("Mapillary selects nearby captures and rejects distant or unsafe images", () => {
  const image = (
    id: string,
    x: number,
    url = "https://scontent.test.fbcdn.net/photo.jpg",
  ) => ({
    id,
    computed_geometry: { coordinates: [x, 32] },
    thumb_1024_url: url,
  });
  assert.equal(
    nearestCapture(
      [image("1", -97.0001), image("2", -97.00001), image("3", -97.1)],
      [-97, 32],
    ).id,
    "2",
  );
  assert.equal(nearestCapture([image("1", -97.1)], [-97, 32]), undefined);
  assert.equal(
    nearestCapture([image("1", -97, "https://evil.test/photo")], [-97, 32]),
    undefined,
  );
  assert.equal(safeThumbnail("https://fbcdn.net.evil.test/a"), false);
});
test("Mapillary missing token makes no external requests", async () => {
  const result = await lookupMapillary(
    seed().properties[0],
    undefined,
    async () => {
      throw new Error("must not call");
    },
  );
  assert.equal(result.status, "setup_required");
});
test("Address geocoding, read-only authorization and capture attribution work without Google", async () => {
  const requests: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith("https://geocoding.geo.census.gov/"))
      return Response.json({
        result: {
          addressMatches: [
            { matchedAddress: "Test address", coordinates: { x: -97, y: 32 } },
          ],
        },
      });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "OAuth fixture-token",
    );
    assert.ok(!url.includes("fixture-token"));
    return Response.json({
      data: [
        {
          id: "123",
          geometry: { coordinates: [-97.00001, 32] },
          thumb_1024_url: "https://scontent.test.fbcdn.net/photo.jpg",
          creator: { username: "Fixture author" },
          captured_at: 1700000000000,
        },
      ],
    });
  };
  const result = await lookupMapillary(
    seed().properties[0],
    "fixture-token",
    fake,
  );
  assert.equal(result.status, "ready");
  assert.equal(result.copyright, "Mapillary · Fixture author");
  assert.ok(!JSON.stringify(result).includes("fixture-token"));
  assert.equal(requests.length, 2);
});
test("Ambiguous addresses never select imagery from a guessed property", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => {
    calls++;
    return Response.json({ result: { addressMatches: [{}, {}] } });
  };
  assert.equal(
    (await lookupMapillary(seed().properties[0], "fixture", fake)).status,
    "unavailable",
  );
  assert.equal(calls, 1);
});
