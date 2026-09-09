import * as os from "node:os";
import { $ } from "bun";

/**
 * Environment that severs a fixture repository from host Git configuration.
 *
 * All inherited `GIT_*` variables are discarded before these controlled
 * values are applied. This prevents repository-local overrides such as
 * `GIT_DIR`, `GIT_WORK_TREE`, and `GIT_INDEX_FILE` from taking precedence
 * over `cwd`, while also excluding host config, template, and execution-path
 * overrides. Prompts are disabled, and a fixed author/committer identity is
 * injected so `commit` never falls back to host `user.*` config. Callers still
 * pass `--no-gpg-sign --no-verify` on commits as belt-and-suspenders (see
 * {@link isolatedGitCommit}).
 */
const ISOLATED_GIT_ENV: Record<string, string> = {
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_SYSTEM: os.devNull,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_TERMINAL_PROMPT: "0",
	GIT_AUTHOR_NAME: "Test User",
	GIT_AUTHOR_EMAIL: "test@example.com",
	GIT_COMMITTER_NAME: "Test User",
	GIT_COMMITTER_EMAIL: "test@example.com",
};

function isolatedGitEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key in Bun.env) {
		const value = Bun.env[key];
		if (value !== undefined && !key.startsWith("GIT_")) env[key] = value;
	}
	return { ...env, ...ISOLATED_GIT_ENV };
}

/**
 * Run one `git` invocation in `cwd`, isolated from host config, hooks, signing,
 * and interactive prompts. Throws on a nonzero exit so setup failures surface.
 */
export async function isolatedGit(cwd: string, ...args: string[]): Promise<void> {
	await $`git ${args}`.cwd(cwd).env(isolatedGitEnv()).quiet();
}

/** {@link isolatedGit} `commit`, additionally skipping signing and hooks. */
export function isolatedGitCommit(cwd: string, message: string): Promise<void> {
	return isolatedGit(cwd, "commit", "--no-gpg-sign", "--no-verify", "-m", message);
}
