import * as os from "node:os";
import { $ } from "bun";

/**
 * Environment that severs a fixture repository from host Git configuration.
 *
 * Global and system config are redirected to the null device (and
 * `GIT_CONFIG_NOSYSTEM` disables `/etc/gitconfig` outright), so host settings
 * like `commit.gpgsign` or a global `core.hooksPath` cannot make a fixture
 * `commit` prompt, fail, or execute user hook code. Prompts are disabled, and a
 * fixed author/committer identity is injected so `commit` never falls back to
 * host `user.*` config. Callers still pass `--no-gpg-sign --no-verify` on
 * commits as belt-and-suspenders (see {@link isolatedGitCommit}).
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

/**
 * Run one `git` invocation in `cwd`, isolated from host config, hooks, signing,
 * and interactive prompts. Throws on a nonzero exit so setup failures surface.
 */
export async function isolatedGit(cwd: string, ...args: string[]): Promise<void> {
	await $`git ${args}`
		.cwd(cwd)
		.env({ ...Bun.env, ...ISOLATED_GIT_ENV })
		.quiet();
}

/** {@link isolatedGit} `commit`, additionally skipping signing and hooks. */
export function isolatedGitCommit(cwd: string, message: string): Promise<void> {
	return isolatedGit(cwd, "commit", "--no-gpg-sign", "--no-verify", "-m", message);
}
