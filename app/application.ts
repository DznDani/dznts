import EventEmitter from "node:events"
import path from "node:path"
import {
	BrowserWindow,
	type IpcMainEvent,
	type IpcMainInvokeEvent,
	Menu,
	type NativeImage,
	Notification,
	Tray,
	app,
	globalShortcut,
	ipcMain,
	nativeImage,
	screen,
	shell,
} from "electron"
import serve from "electron-serve"

import * as credentials from "./credentials"
import * as history from "./history"
import { NTSLiveTracks } from "./live-tracks"
import * as preferences from "./preferences"
import { show } from "./show"

import menubarOne from "../logos/menu-one.png"
import menubarTwo from "../logos/menu-two.png"
import menubar from "../logos/menu.png"

const loadURL = serve({ directory: "client" })

type OpenURLResult =
	| { ok: true }
	| {
			ok: false
			error: string
	  }

export class NTSApplication {
	window: BrowserWindow
	tray: Tray
	evts: EventEmitter
	production: boolean
	liveTracks: NTSLiveTracks

	constructor(production: boolean) {
		this.window = makeWindow()
		this.tray = makeTray()
		this.evts = new EventEmitter()
		this.production = production
		this.liveTracks = new NTSLiveTracks(this.window.webContents)
	}

	async init() {
		this.tray.on("click", () => this.toggle())
		this.tray.on("right-click", () => this.openMenu())

		if (process.platform === "darwin") {
			// @ts-expect-error: only supported on macOS
			this.tray.on("drop-text", (_evt: IpcMainEvent, url: string) => {
				void this.openURL(url)
			})
		}

		this.evts.on("error", (message: string) => this.showNotification(message))

		ipcMain.on("init", this.syncPreferences.bind(this))

		ipcMain.on("close", () => this.close())
		ipcMain.on("tracklist", (_evt: IpcMainEvent, channel: number | string) =>
			this.openTracklist(channel),
		)
		ipcMain.on("my-nts", () => this.openMyNTS())
		ipcMain.on("explore", () => this.openExplore())
		ipcMain.on("playing", this.handlePlaying.bind(this))
		ipcMain.on("chat", (_evt: IpcMainEvent, channel: number) =>
			this.openChat(channel),
		)
		ipcMain.on("preferences", (_evt: IpcMainEvent, prefs: preferences.Preferences) =>
			this.storePreferences(prefs),
		)
		ipcMain.handle("open-show-url", async (_evt: IpcMainInvokeEvent, url: string) => {
			const result = await this.openURL(url, { notify: false })
			if (!result.ok) {
				throw new Error(result.error)
			}
			return true
		})

		if (process.platform === "darwin") {
			app.on("activate", () => this.open())
			setTimeout(() => app.dock.hide(), 1500)
		}

		app.on("will-quit", () => globalShortcut.unregisterAll())

		globalShortcut.register("Control+N", () => this.toggle())
		await this.liveTracks.init()
		await this.loadClient()
	}

	showFromSecondInstance() {
		if (this.window.isMinimized()) {
			this.window.restore()
		}
		this.open()
	}

	login() {
		this.window.webContents.send("login")
		this.open()
	}

	async loadClient() {
		if (this.production) {
			await loadURL(this.window)
			this.window.loadURL("app://-")
		} else {
			this.window.loadURL("http://localhost:5173")
		}
	}

	isOpen() {
		return this.window.isVisible()
	}

	close() {
		this.window.webContents.send("close")
		setTimeout(() => this.window.hide(), 10)
		this.liveTracks.unsubscribe?.()
	}

	handleBlur() {
		if (!this.window.webContents.isDevToolsOpened()) {
			this.close()
		}
	}

	handlePlaying(_evt: IpcMainEvent, channel: 1 | 2 | string | null) {
		if (channel === 1 || channel === 2) {
			this.setIcon(channel)
			return
		}
		this.clearIcon()
	}

	setIcon(channel: 1 | 2) {
		const icon = makeIcon(channel === 1 ? menubarOne : menubarTwo)
		this.tray.setImage(icon)
	}

	clearIcon() {
		const icon = makeIcon(menubar)
		this.tray.setImage(icon)
	}

	open() {
		this.window.webContents.send("open")
		const { x, y } = getPopupPosition(this.window, this.tray)
		this.window.setPosition(x, y, false)
		this.window.show()
		this.window.focus()
		this.liveTracks.subscribe()
		this.liveTracks.sync()

		setTimeout(() => this.window.once("blur", () => this.handleBlur()), 300)
	}

	async syncPreferences() {
		const prefs = await preferences.read()
		this.window.webContents.send("preferences", prefs)
		this.window.webContents.send("preferences", prefs)
		this.window.webContents.send("preferences", prefs)
	}

	toggle() {
		if (this.isOpen()) {
			this.close()
		} else {
			this.open()
		}
	}

	reload() {
		this.window.reload()
		this.liveTracks.subscribe()
	}

	async openMenu() {
		this.close()
		const menu = await makeMenu(this)
		this.tray.popUpContextMenu(menu)
	}

	async openURL(url: string, options: { notify?: boolean } = {}): Promise<OpenURLResult> {
		const cleanURL = url.trim()
		if (!cleanURL.startsWith("https://www.nts.live/shows/")) {
			const message = "Please use a valid NTS show URL"
			if (options.notify !== false) {
				this.evts.emit("error", message)
			}
			return { ok: false, error: message }
		}

		try {
			const data = await show(cleanURL)
			history.add({ name: data.name, url: cleanURL })
			this.window.webContents.send("open-show", data)
			return { ok: true }
		} catch (_err) {
			const message = "Could not open this NTS show URL"
			if (options.notify !== false) {
				this.evts.emit("error", message)
			}
			return { ok: false, error: message }
		}
	}

	promptArchiveShowURL() {
		this.open()
		this.window.webContents.send("open-archive-url")
	}

	showNotification(message: string) {
		const notification = new Notification({
			body: message,
			silent: true,
		})
		notification.show()
	}

	openAbout() {
		shell.openExternal("https://github.com/romeovs/nts-desktop")
	}

	openTracklist(channel: number | string) {
		shell.openExternal(`https://www.nts.live/live-tracklist/${channel}`)
	}

	openMyNTS() {
		shell.openExternal("https://www.nts.live/my-nts/favourites/shows")
	}

	openExplore() {
		shell.openExternal("https://www.nts.live/explore")
	}

	openChat(channel: number) {
		if (channel === 1) {
			shell.openExternal(
				"https://discord.com/channels/909834111592591421/933364043459227708",
			)
		} else {
			shell.openExternal(
				"https://discord.com/channels/909834111592591421/935528991501209600",
			)
		}
	}

	openSchedule() {
		shell.openExternal("https://www.nts.live/schedule")
	}

	async storePreferences(prefs: Partial<preferences.Preferences>) {
		const old = await preferences.read()
		await preferences.write({
			...old,
			...prefs,
		})
	}
}

function makeWindow(): BrowserWindow {
	// Initialise window
	const window = new BrowserWindow({
		width: 360,
		height: 270,
		show: false,
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		paintWhenInitiallyHidden: true,
		webPreferences: {
			backgroundThrottling: false,
			webSecurity: true,
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			preload: path.resolve(__dirname, "preload.js"),
		},
	})

	window.setAlwaysOnTop(true, "floating")
	if (process.platform !== "win32") {
		window.setVisibleOnAllWorkspaces(true)
	}
	window.fullScreenable = false

	return window
}

function makeIcon(filename: string): NativeImage {
	const filepath = path.resolve(__dirname, filename)
	const original = nativeImage.createFromPath(filepath)
	const size = original.getSize()
	const ratio = size.width / size.height
	const height = 18
	const icon = original.resize({
		height,
		width: Math.round(height * ratio * 10) / 10,
	})
	icon.setTemplateImage(true)
	return icon
}

function makeTray(): Tray {
	const icon = makeIcon(menubar)
	const tray = new Tray(icon)
	if (process.platform === "darwin") {
		tray.setIgnoreDoubleClickEvents(true)
	}
	return tray
}

async function makeMenu(application: NTSApplication): Promise<Menu> {
	const h = await history.read()
	const hasCredentials = await credentials.has()

	return Menu.buildFromTemplate([
		{
			label: "About NTS Desktop",
			click: () => application.openAbout(),
		},
		{
			label: "Show NTS Desktop",
			accelerator: "Control+N",
			acceleratorWorksWhenHidden: true,
			click: () => application.open(),
		},
		{ type: "separator" },
		{
			label: "Open Schedule...",
			click: () => application.openSchedule(),
		},
		{
			label: "Open Favourites...",
			click: () => application.openMyNTS(),
		},
		{ type: "separator" },
		{
			label: "Load Archive Show URL...",
			click: () => application.promptArchiveShowURL(),
		},
		{
			label: "Recently Listened Archive Shows",
			submenu: [
				...h.map((entry) => ({
					label: entry.name,
					click: () => void application.openURL(entry.url),
				})),
				{
					type: "separator",
				},
				{
					label: "Clear",
					enabled: h.length > 0,
					click: () => history.clear(),
				},
			],
		},
		{ type: "separator" },
		!hasCredentials
			? {
					label: "Log in to get live tracks...",
					click: () => application.login(),
				}
			: {
					label: "Log out",
					click: () => application.liveTracks.logout(),
				},
		{ type: "separator" },
		{
			label: "Reload NTS Desktop",
			click: () => application.reload(),
		},
		{ label: "Quit NTS Desktop", role: "quit" },
	])
}

function getPopupPosition(window: BrowserWindow, tray: Tray): { x: number; y: number } {
	const trayBounds = tray.getBounds()
	const windowBounds = window.getBounds()
	const margin = 8

	if (trayBounds.width === 0 || trayBounds.height === 0) {
		const cursor = screen.getCursorScreenPoint()
		const display = screen.getDisplayNearestPoint(cursor)
		const { workArea } = display
		return {
			x: workArea.x + Math.round((workArea.width - windowBounds.width) / 2),
			y: workArea.y + Math.round((workArea.height - windowBounds.height) / 2),
		}
	}

	const anchor = {
		x: trayBounds.x + Math.round(trayBounds.width / 2),
		y: trayBounds.y + Math.round(trayBounds.height / 2),
	}

	const display = screen.getDisplayNearestPoint(anchor)
	const { bounds, workArea } = display

	let x = anchor.x - Math.round(windowBounds.width / 2)
	let y = workArea.y + workArea.height - windowBounds.height - margin

	const taskbarOnLeft = workArea.x > bounds.x
	const taskbarOnTop = workArea.y > bounds.y
	const taskbarOnRight =
		workArea.width < bounds.width && workArea.x === bounds.x

	if (taskbarOnLeft) {
		x = workArea.x + margin
		y = anchor.y - Math.round(windowBounds.height / 2)
	} else if (taskbarOnTop) {
		y = workArea.y + margin
	} else if (taskbarOnRight) {
		x = workArea.x + workArea.width - windowBounds.width - margin
		y = anchor.y - Math.round(windowBounds.height / 2)
	}

	const minX = workArea.x + margin
	const maxX = workArea.x + workArea.width - windowBounds.width - margin
	const minY = workArea.y + margin
	const maxY = workArea.y + workArea.height - windowBounds.height - margin

	return {
		x: clamp(x, minX, Math.max(minX, maxX)),
		y: clamp(y, minY, Math.max(minY, maxY)),
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}
