/**
 * Tests for `hooks/init.ts` - the meet-join init hook that probes Docker
 * availability and records which bot-runner backend to use.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import init from "../init.js";
import {
  getMeetBotBackend,
  resetMeetBotBackendForTests,
} from "../../daemon/meet-backend.js";
import type { InitContext } from "@vellumai/plugin-api";

interface LogCall {
  obj: Record<string, unknown>;
  msg?: string;
}

function makeCtx(): { ctx: InitContext; logs: LogCall[] } {
  const logs: LogCall[] = [];
  const record =
    () =>
    (obj: Record<string, unknown>, msg?: string): void => {
      logs.push({ obj, msg });
    };
  const ctx = {
    config: {},
    logger: {
      info: record(),
      warn: record(),
      error: record(),
      debug: record(),
    },
    pluginStorageDir: "/tmp/meet-join-plugin",
    assistantVersion: "0.0.0-test",
  } as unknown as InitContext;
  return { ctx, logs };
}

afterEach(() => {
  resetMeetBotBackendForTests();
  delete process.env.MEET_DOCKER_SOCKET;
});

describe("meet-join init hook", () => {
  test("records the direct backend when no Docker Engine is reachable", async () => {
    // Point the probe at a socket that does not exist.
    process.env.MEET_DOCKER_SOCKET = join(
      tmpdir(),
      `no-docker-${Date.now()}.sock`,
    );
    const { ctx, logs } = makeCtx();

    await init(ctx);

    expect(getMeetBotBackend()).toBe("direct");
    const decision = logs.find((l) => l.obj.backend !== undefined);
    expect(decision?.obj.backend).toBe("direct");
    expect(decision?.msg).toContain("direct child process");
  });
});
