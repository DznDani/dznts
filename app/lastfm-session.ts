import { promises as fs } from "node:fs"
import path from "node:path"
import { app, safeStorage } from "electron"

export type LastFmSession = {
	sessionKey: string
	username: string
}

const filename = path.join(app.getPath("userData"), "lastfm-session.json")

export async function read(): Promise<LastFmSession | null> {
	try {
		const buf = await fs.readFile(filename)
		const content = safeStorage.decryptString(buf)
		const session = JSON.parse(content)
		if (session.sessionKey && session.username) {
			return session
		}
		return null
	} catch (err) {
		return null
	}
}

export async function write(session: LastFmSession): Promise<void> {
	const content = JSON.stringify(session)
	const buf = safeStorage.encryptString(content)
	await fs.writeFile(filename, buf)
}

export async function clear(): Promise<void> {
	try {
		await fs.unlink(filename)
	} catch (err) {
		// ignore if file doesn't exist
	}
}

export async function has(): Promise<boolean> {
	const session = await read()
	return session !== null
}
