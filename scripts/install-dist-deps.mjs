import { spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"

function run(command, args, options = {}) {
	return spawnSync(command, args, {
		stdio: "inherit",
		shell: process.platform === "win32",
		...options,
	})
}

async function getPinnedPnpmVersion() {
	const content = await readFile(".tool-versions", "utf8")
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed.startsWith("pnpm ")) {
			continue
		}

		const [, version] = trimmed.split(/\s+/, 2)
		if (version) {
			return version
		}
	}
	return "8.9.0"
}

async function main() {
	const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
	const corepackCmd = process.platform === "win32" ? "corepack.cmd" : "corepack"

	// npm creates a flat node_modules tree, which packages reliably into app.asar.
	const npmInstall = run(
		npmCmd,
		[
			"install",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
			"--package-lock=false",
			"--legacy-peer-deps",
		],
		{ cwd: "dist" },
	)
	if (!npmInstall.error && npmInstall.status === 0) {
		return
	}

	const version = await getPinnedPnpmVersion()
	const fallback = run(corepackCmd, [
		`pnpm@${version}`,
		"--dir",
		"dist",
		"install",
		"--prod",
		"--force",
		"--no-frozen-lockfile",
	])
	if (!fallback.error && fallback.status === 0) {
		return
	}

	if (fallback.error) {
		throw fallback.error
	}

	throw new Error(`Failed to install dist dependencies (exit code ${fallback.status})`)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
