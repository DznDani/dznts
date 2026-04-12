import { app } from "electron"

import { NTSApplication } from "./application"

let application: NTSApplication | null = null

async function main() {
	const production = __dirname.endsWith(".asar")
	console.log(`Starting NTS Desktop... (production=${production})`)

	await app.whenReady()

	application = new NTSApplication(production)
	await application.init()
}

if (!app.requestSingleInstanceLock()) {
	app.quit()
} else {
	app.on("second-instance", () => {
		application?.showFromSecondInstance()
	})

	void main().catch((error) => {
		console.error("Failed to start NTS Desktop", error)
		app.quit()
	})
}
