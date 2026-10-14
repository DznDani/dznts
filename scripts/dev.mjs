import { spawn } from "node:child_process"
import http from "node:http"

// 1. Build main and preload once before starting
async function buildMainAndPreload() {
	await runCommand(process.execPath, ["scripts/build-main.mjs"])
	await runCommand(process.execPath, ["scripts/copy-preload.mjs"])
}

function runCommand(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", shell: false })
		child.on("close", (code) => {
			if (code === 0) resolve()
			else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
		})
	})
}

function waitForServer(url, timeoutMs = 15000) {
	const start = Date.now()
	return new Promise((resolve, reject) => {
		const check = () => {
			http
				.get(url, (res) => {
					resolve()
				})
				.on("error", () => {
					if (Date.now() - start > timeoutMs) {
						reject(new Error(`Timeout waiting for dev server at ${url}`))
					} else {
						setTimeout(check, 300)
					}
				})
		}
		check()
	})
}

async function dev() {
	console.log("Preparing main and preload...")
	await buildMainAndPreload()

	console.log("Starting Vite dev server...")
	const viteBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
	const vite = spawn(viteBin, ["exec", "vite"], {
		stdio: "inherit",
		shell: true,
	})

	try {
		await waitForServer("http://localhost:5173")
		console.log("Vite ready! Launching Electron...")

		const electron = spawn(viteBin, ["exec", "electron", "dist"], {
			stdio: "inherit",
			shell: true,
		})

		electron.on("close", (code) => {
			console.log(`Electron closed with code ${code}. Stopping dev server...`)
			vite.kill()
			process.exit(code ?? 0)
		})
	} catch (err) {
		console.error(err)
		vite.kill()
		process.exit(1)
	}
}

dev().catch((err) => {
	console.error(err)
	process.exit(1)
})
