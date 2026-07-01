/**
 * meet-join plugin: tool and route registration entry point.
 *
 * Exported `register(host)` is called exactly once per daemon lifetime
 * when the plugin loads. It wires the plugin's `meet_*` tools and the
 * meet-bot ingress HTTP route into the host's registries so the LLM can
 * invoke the tools and the bot can POST events back to the daemon.
 *
 * ## Isolation
 *
 * This file and every module it imports takes a runtime-injected
 * `SkillHost` from `./plugin-host.js` for logger access, event
 * publication, and registry hooks. The plugin does not reach into the
 * assistant's internals directly; the host surface is the only edge.
 *
 * ## Enablement
 *
 * The plugin's presence is the feature switch: installing it registers the
 * `meet_*` tools, uninstalling (or disabling) it removes them. There is no
 * separate feature flag; tool registration is unconditional.
 *
 * Route registration authenticates against the per-meeting bearer token
 * resolver, which returns null when no session is active. With no session,
 * every request gets a 401 from the handler itself rather than silently
 * falling through to the daemon's JWT middleware (which would reject the
 * bot's opaque bearer token as a malformed JWT).
 */

import type { SkillHost } from "./plugin-host.js";

import { createMeetSessionManager } from "./daemon/session-manager.js";
import {
  handleMeetInternalEvents,
  MEET_INTERNAL_EVENTS_PATH_RE,
} from "./routes/meet-internal.js";
import {
  createMeetDisableAvatarTool,
  createMeetEnableAvatarTool,
} from "./tools/meet-avatar-tool.js";
import { createMeetJoinTool } from "./tools/meet-join-tool.js";
import { createMeetLeaveTool } from "./tools/meet-leave-tool.js";
import { createMeetSendChatTool } from "./tools/meet-send-chat-tool.js";
import {
  createMeetCancelSpeakTool,
  createMeetSpeakTool,
} from "./tools/meet-speak-tool.js";

export function register(host: SkillHost): void {
  // Construct the session manager eagerly so the tool modules that import
  // the module-level `MeetSessionManager` singleton resolve against a live
  // instance. Sub-module factories are resolved from the in-skill
  // registry inside the constructor — the session-manager module's
  // side-effect imports trigger the required `registerSubModule(...)`
  // registrations at import time.
  createMeetSessionManager(host, {});

  host.registries.registerSkillRoute({
    pattern: MEET_INTERNAL_EVENTS_PATH_RE,
    methods: ["POST"],
    handler: (req, match) => {
      // decodeURIComponent throws URIError on malformed percent-encoding
      // (e.g. a stray `%` without two hex digits). Without this guard the
      // error surfaces pre-auth and the daemon returns a 500 — reject with
      // a 400 instead so malformed bot URLs are observable as client errors.
      let meetingId: string;
      try {
        meetingId = decodeURIComponent(match[1]!);
      } catch {
        return Promise.resolve(
          Response.json(
            { error: "Invalid meeting id encoding" },
            { status: 400 },
          ),
        );
      }
      return handleMeetInternalEvents(host, req, meetingId);
    },
  });

  host.registries.registerTools(() => [
    createMeetJoinTool(host),
    createMeetLeaveTool(host),
    createMeetSendChatTool(host),
    createMeetSpeakTool(host),
    createMeetCancelSpeakTool(host),
    createMeetEnableAvatarTool(host),
    createMeetDisableAvatarTool(host),
  ]);
}
