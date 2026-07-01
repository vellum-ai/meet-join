/**
 * meet-join `init` hook.
 *
 * Runs once at plugin bootstrap. The Meet bot needs a browser stack; by
 * default we run it in a throwaway Docker container per meeting, but many
 * environments have no Docker at all - a bare assistant process, a dev box
 * where `docker` is not installed, or a locked-down container that cannot
 * nest containers. In those environments the container spawn fails (the
 * operator sees errors like a missing engine socket or `docker: command
 * not found` from surrounding tooling) and no bot ever joins.
 *
 * This hook probes for a reachable Docker Engine and records which backend
 * the session manager should use:
 *
 *   - Docker reachable → `"docker"`: spawn a container per meeting.
 *   - Docker absent    → `"direct"`: run the bot as a child process of the
 *     assistant.
 *
 * The probe targets the same Engine socket the container runner would use,
 * so "reachable here at boot" implies "spawnable at join time". The result
 * is stored in the process-wide backend selector that the runner factory
 * reads lazily on each join.
 */

import type { HookFunction, InitContext } from "@vellumai/plugin-api";

import {
  detectDockerAvailable,
  resolveDockerSocketPath,
  setMeetBotBackend,
} from "../daemon/meet-backend.js";

const init: HookFunction<InitContext> = async (ctx: InitContext) => {
  const socketPath = resolveDockerSocketPath();
  const dockerAvailable = await detectDockerAvailable(socketPath);
  const backend = dockerAvailable ? "docker" : "direct";

  setMeetBotBackend(backend);

  if (backend === "docker") {
    ctx.logger.info(
      { backend, socketPath },
      "meet-join: Docker Engine reachable - Meet bot will run in a per-meeting container",
    );
  } else {
    ctx.logger.info(
      { backend, socketPath },
      "meet-join: no reachable Docker Engine - Meet bot will run as a direct child process",
    );
  }
};

export default init;
