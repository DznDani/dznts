import { mkdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"

import { build } from "esbuild"

function readFirebaseConfig() {
	if (process.env.FIREBASE_CONFIG) {
		return process.env.FIREBASE_CONFIG
	}

	const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
	const output = spawnSync(pnpmCmd, ["exec", "dotenv", "-p", "FIREBASE_CONFIG"], {
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "ignore"],
	})

	if (output.status === 0) {
		return output.stdout.trim()
	}

	return ""
}

async function main() {
	const firebaseConfig = readFirebaseConfig()
	await mkdir("dist", { recursive: true })

	await build({
		bundle: true,
		format: "cjs",
		platform: "node",
		packages: "external",
		external: ["electron"],
		loader: {
			".png": "file",
		},
		entryPoints: ["app/main.ts"],
		outfile: "dist/index.cjs",
		define: {
			FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
		},
	})
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
