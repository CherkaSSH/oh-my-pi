/**
 * Regression tests for #11362:
 * OMP-installed marketplace agents load by default, Claude user-registry agents
 * remain opt-in, and disabling the provider excludes both origins.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	disableProvider,
	disableUserSource,
	enableProvider,
	enableUserSource,
} from "@oh-my-pi/pi-coding-agent/capability";
import { clearCache as clearFsCache } from "@oh-my-pi/pi-coding-agent/capability/fs";
import { clearClaudePluginRootsCache } from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { discoverAgents } from "@oh-my-pi/pi-coding-agent/task/discovery";
import { removeSyncWithRetries } from "@oh-my-pi/pi-utils";
import { restoreEnvValue } from "../helpers/settings-test-state";

const CLAUDE_PLUGIN_AGENT_MD = [
	"---",
	"name: claude-simplifier",
	"description: A code simplifier agent from a Claude plugin",
	"---",
	"Simplify code.",
].join("\n");
const OMP_PLUGIN_AGENT_MD = [
	"---",
	"name: omp-simplifier",
	"description: A code simplifier agent installed by OMP",
	"---",
	"Simplify code.",
].join("\n");

describe("discoverAgents — claude-plugins provider gates", () => {
	let tempHome: string;
	let originalClaudeConfigDir: string | undefined;

	beforeEach(() => {
		originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
		delete process.env.CLAUDE_CONFIG_DIR;
		delete Bun.env.CLAUDE_CONFIG_DIR;
		tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-disco-home-"));
		vi.spyOn(os, "homedir").mockReturnValue(tempHome);

		// Build a fake Claude plugin install with an agents/ subdirectory.
		const pluginInstallPath = path.join(tempHome, "plugin-cache", "code-simplifier");
		const agentsDir = path.join(pluginInstallPath, "agents");
		fs.mkdirSync(agentsDir, { recursive: true });
		fs.writeFileSync(path.join(agentsDir, "claude-simplifier.md"), CLAUDE_PLUGIN_AGENT_MD);

		// Register the plugin in the Claude registry so listClaudePluginRoots picks it up.
		const claudePluginsDir = path.join(tempHome, ".claude", "plugins");
		fs.mkdirSync(claudePluginsDir, { recursive: true });
		fs.writeFileSync(
			path.join(claudePluginsDir, "installed_plugins.json"),
			JSON.stringify({
				version: 2,
				plugins: {
					"code-simplifier@claude-plugins-official": [
						{
							installPath: pluginInstallPath,
							version: "1.0.0",
							scope: "user",
							installedAt: "2025-01-01T00:00:00Z",
							lastUpdated: "2025-01-01T00:00:00Z",
						},
					],
				},
			}),
		);

		// Register a separate user-scope plugin installed through OMP's marketplace.
		const ompPluginInstallPath = path.join(tempHome, "plugin-cache", "omp-simplifier");
		const ompAgentsDir = path.join(ompPluginInstallPath, "agents");
		fs.mkdirSync(ompAgentsDir, { recursive: true });
		fs.writeFileSync(path.join(ompAgentsDir, "omp-simplifier.md"), OMP_PLUGIN_AGENT_MD);
		const ompPluginsDir = path.join(tempHome, ".omp", "plugins");
		fs.mkdirSync(ompPluginsDir, { recursive: true });
		fs.writeFileSync(
			path.join(ompPluginsDir, "installed_plugins.json"),
			JSON.stringify({
				version: 2,
				plugins: {
					"omp-simplifier@local-marketplace": [
						{
							installPath: ompPluginInstallPath,
							version: "1.0.0",
							scope: "user",
						},
					],
				},
			}),
		);

		// Start each test with a clean provider + cache state.
		enableProvider("claude-plugins");
		disableUserSource("claude-plugins");
		disableUserSource("claude");
		disableUserSource("*");
		disableUserSource("all");
		clearFsCache();
		clearClaudePluginRootsCache();
	});

	afterEach(() => {
		removeSyncWithRetries(tempHome);
		// Restore global state so other tests in the suite are not affected.
		vi.restoreAllMocks();
		restoreEnvValue("CLAUDE_CONFIG_DIR", originalClaudeConfigDir);
		enableProvider("claude-plugins");
		disableUserSource("claude-plugins");
		disableUserSource("claude");
		disableUserSource("*");
		disableUserSource("all");
		clearFsCache();
		clearClaudePluginRootsCache();
	});

	test("loads OMP-installed user plugin agents without opting into Claude's registry", async () => {
		const { agents } = await discoverAgents(tempHome, tempHome);
		const names = agents.map(agent => agent.name);
		expect(names).toContain("omp-simplifier");
		expect(names).not.toContain("claude-simplifier");
	});

	test("includes plugin agents once claude-plugins is opted in", async () => {
		enableUserSource("claude-plugins");
		const { agents } = await discoverAgents(tempHome, tempHome);
		expect(agents.map(a => a.name)).toContain("claude-simplifier");
	});

	test("disabledProviders wins over the opt-in", async () => {
		enableUserSource("claude-plugins");
		disableProvider("claude-plugins");
		clearClaudePluginRootsCache();
		const { agents } = await discoverAgents(tempHome, tempHome);
		expect(agents.map(a => a.name)).not.toEqual(expect.arrayContaining(["claude-simplifier", "omp-simplifier"]));
	});
});
