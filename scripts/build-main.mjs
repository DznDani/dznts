import { mkdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"

import { build } from "esbuild"

import fs from "node:fs"

function readEnvVar(name) {
	if (process.env[name]) {
		return process.env[name]
	}

	try {
		const envContent = fs.readFileSync(".env", "utf-8")
		const match = envContent.match(new RegExp(`^${name}=(.*)$`, "m"))
		if (match) {
			return match[1].trim()
		}
	} catch (e) {
		// Ignore if .env doesn't exist
	}

	return ""
}

async function main() {
	const firebaseConfig = readEnvVar("FIREBASE_CONFIG")
	const lastfmApiKey = readEnvVar("LASTFM_API_KEY")
	const lastfmSharedSecret = readEnvVar("LASTFM_SHARED_SECRET")
	await mkdir("dist", { recursive: true })

	await build({
		bundle: true,
		format: "cjs",
		platform: "node",
		packages: "external",
		external: ["electron"],
		loader: {
			".ico": "file",
			".png": "file",
		},
		entryPoints: ["app/main.ts"],
		outfile: "dist/index.cjs",
		define: {
			FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
			LASTFM_API_KEY: JSON.stringify(lastfmApiKey),
			LASTFM_SHARED_SECRET: JSON.stringify(lastfmSharedSecret),
		},
	})
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})

