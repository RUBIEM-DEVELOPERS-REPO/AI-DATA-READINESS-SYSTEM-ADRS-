import test from "node:test";
import assert from "node:assert/strict";
import { getVault, setVault, InMemoryVault } from "../server/connector-vault";

test("setVault and getVault use provided implementation", () => {
  // preserve current instance
  const original = getVault();

  const mem = new InMemoryVault();
  setVault(mem);
  const v = getVault();
  assert.equal(v instanceof InMemoryVault, true);

  // restore original
  try {
    setVault(original as any);
  } catch {
    // ignore if original is not settable
  }
});
