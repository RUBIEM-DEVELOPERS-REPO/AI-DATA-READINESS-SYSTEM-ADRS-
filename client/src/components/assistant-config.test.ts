import test from "node:test";
import assert from "node:assert/strict";
import { getPortalAssistantConfig } from "./assistant-config";

test("returns admin-specific copilot and agent defaults", () => {
  const config = getPortalAssistantConfig("admin");

  assert.equal(config.copilot.title, "Admin Copilot");
  assert.equal(config.agent.title, "Admin Agent");
  assert.equal(config.agent.layer, "system");
  assert.match(config.copilot.initialMessage, /administration/i);
});

test("returns data-subject defaults for public intake", () => {
  const config = getPortalAssistantConfig("data-subject");

  assert.equal(config.copilot.title, "Data Subject Copilot");
  assert.equal(config.agent.subtitle, "Public DSR intake guidance");
  assert.equal(config.agent.layer, "system");
  assert.match(config.agent.initialMessage, /data subject/i);
});
