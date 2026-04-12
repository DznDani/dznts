import { copyFile, mkdir } from "node:fs/promises"

async function main() {
	await mkdir("dist", { recursive: true })
	await copyFile("app/preload.js", "dist/preload.js")
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
