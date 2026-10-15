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
	nativeTheme,
	screen,
	shell,
} from "electron"
import serve from "electron-serve"

import * as credentials from "./credentials"
import * as history from "./history"
import * as lastfm from "./lastfm"
import { NTSLastFmScrobbler } from "./lastfm-scrobbler"
import * as lastfmSession from "./lastfm-session"
import { NTSLiveTracks } from "./live-tracks"
import * as preferences from "./preferences"
import { DiscordRPCService, type DiscordPresencePayload } from "./discord-rpc"
import { type ShowInfo, type Track, show } from "./show"
import type { ExternalTarget, LastFmStatus, SettingsSnapshot } from "./settings-state"
import { UpNextQueue, type UpNextEpisode, episodePathFromURL } from "./up-next"

import trayDarkCh1 from "../logos/dznts-tray-dark-ch1.ico"
import trayDarkCh2 from "../logos/dznts-tray-dark-ch2.ico"
import trayDarkIdle from "../logos/dznts-tray-dark-idle.ico"
import trayLightCh1 from "../logos/dznts-tray-light-ch1.ico"
import trayLightCh2 from "../logos/dznts-tray-light-ch2.ico"
import trayLightIdle from "../logos/dznts-tray-light-idle.ico"

const loadURL = serve({ directory: "client" })

type OpenURLResult =
	| { ok: true }
	| {
			ok: false
			error: string
	  }

type TrayTheme = "light" | "dark"
type TrayState = "idle" | 1 | 2

type TrayIconSet = {
	idle: string
	one: string
	two: string
}

const trayIcons: Record<TrayTheme, TrayIconSet> = {
	light: {
		idle: trayLightIdle,
		one: trayLightCh1,
		two: trayLightCh2,
	},
	dark: {
		idle: trayDarkIdle,
		one: trayDarkCh1,
		two: trayDarkCh2,
	},
}

export class NTSApplication {
	window: BrowserWindow
	tray: Tray
	evts: EventEmitter
	production: boolean
	liveTracks: NTSLiveTracks
	trayState: TrayState
	scrobbler: NTSLastFmScrobbler
	discordRPC: DiscordRPCService
	lastfmToken: string | null = null
	private lastfmPoll: NodeJS.Timeout | null = null
	upNext: UpNextQueue = new UpNextQueue()
	private trayIconCache = new Map<string, NativeImage>()

	constructor(production: boolean) {
		this.window = makeWindow()
		this.trayState = "idle"
		this.tray = makeTray(this.getCachedTrayImage(getTrayIconPath(this.trayState)))
		this.evts = new EventEmitter()
		this.production = production
		this.liveTracks = new NTSLiveTracks(this.window.webContents)
		this.scrobbler = new NTSLastFmScrobbler()

		// @ts-expect-error injected by esbuild define
		const discordClientId = typeof DISCORD_CLIENT_ID !== "undefined" ? DISCORD_CLIENT_ID : ""
		this.discordRPC = new DiscordRPCService(discordClientId)
	}

	async init() {
		this.tray.on("click", () => this.toggle())
		this.tray.on("right-click", () => this.openMenu())
		nativeTheme.on("updated", () => this.updateTrayIcon())

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
		ipcMain.on("show-ended", (_evt: IpcMainEvent, episodePath: string | null) => {
			void this.handleShowEnded(episodePath)
		})
		ipcMain.on("show-closed", () => {
			this.upNext.setCurrent(null, false)
		})

		// Last.fm IPC handlers
		ipcMain.on(
			"lastfm-scrobbler-update",
			(
				_evt: IpcMainEvent,
				data: { position: number; tracklist: Track[]; showName: string },
			) => {
				this.scrobbler.setShow(data.showName, data.tracklist)
				void this.scrobbler.update(data.position)
			},
		)
		ipcMain.on("lastfm-scrobbler-position", (_evt: IpcMainEvent, position: number) => {
			void this.scrobbler.update(position)
		})
		ipcMain.on("lastfm-scrobbler-stop", () => {
			this.scrobbler.reset()
		})

		// Discord Rich Presence IPC handlers
		ipcMain.on(
			"discord:update-presence",
			(_evt: IpcMainEvent, payload: DiscordPresencePayload) => {
				void this.discordRPC.updatePresence(payload)
			},
		)
		ipcMain.on("discord:clear-presence", () => {
			void this.discordRPC.clearPresence()
		})

		this.upNext.onChange = () =>
			this.push("upnext:changed", this.upNext.snapshot())
		this.registerSettingsIPC()

		if (process.platform === "darwin") {
			app.on("activate", () => this.open())
			setTimeout(() => app.dock.hide(), 1500)
		}

		app.on("will-quit", () => {
			globalShortcut.unregisterAll()
			void this.discordRPC.destroy()
			this.trayIconCache.clear()
		})

		globalShortcut.register("Control+N", () => this.toggle())
		await this.liveTracks.init()
		await this.scrobbler.init()
		const initialPrefs = await preferences.read()
		this.discordRPC.setEnabled(initialPrefs.discordRPC)
		await this.loadClient()
	}

	private push(channel: string, payload: unknown) {
		if (!this.window.isDestroyed()) {
			this.window.webContents.send(channel, payload)
		}
	}

	// --- Settings ---

	private registerSettingsIPC() {
		ipcMain.handle("settings:snapshot", () => this.getSettingsSnapshot())
		ipcMain.handle("lastfm:connect", () => this.lastfmConnect())
		ipcMain.handle("lastfm:cancel", () => this.lastfmCancel())
		ipcMain.handle("lastfm:disconnect", () => this.lastfmDisconnect())
		ipcMain.handle("credentials:logout", () => this.ntsLogout())
		ipcMain.handle("history:clear", async () => {
			await history.clear()
			this.push("history:changed", [])
		})
		ipcMain.handle("upnext:play-next", () => this.playNext({ auto: false }))
		ipcMain.handle("upnext:play", (_evt: IpcMainInvokeEvent, path: string) =>
			this.playUpNext(path),
		)
		ipcMain.handle("upnext:remove", (_evt: IpcMainInvokeEvent, path: string) => {
			this.upNext.remove(path)
		})
		ipcMain.on("external:open", (_evt: IpcMainEvent, target: ExternalTarget) => {
			if (target === "schedule") {
				this.openSchedule()
			} else if (target === "favourites") {
				this.openMyNTS()
			} else if (target === "about") {
				this.openAbout()
			}
		})
	}

	async getSettingsSnapshot(): Promise<SettingsSnapshot> {
		return {
			version: app.getVersion(),
			lastfm: await this.getLastfmStatus(),
			ntsLoggedIn: await credentials.has(),
			history: await history.read(),
			upNext: this.upNext.snapshot(),
		}
	}

	async getLastfmStatus(): Promise<LastFmStatus> {
		if (!lastfm.isConfigured()) {
			return { state: "unavailable" }
		}
		const session = await lastfmSession.read()
		if (session) {
			return { state: "connected", username: session.username }
		}
		return this.lastfmToken ? { state: "pending" } : { state: "disconnected" }
	}

	async pushLastfmStatus() {
		this.push("lastfm:status", await this.getLastfmStatus())
	}

	async ntsLogout() {
		await this.liveTracks.logout()
		this.push("credentials:status", false)
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
		this.trayState = channel
		this.updateTrayIcon()
	}

	clearIcon() {
		this.trayState = "idle"
		this.updateTrayIcon()
	}

	private getCachedTrayImage(iconPath: string): NativeImage {
		let image = this.trayIconCache.get(iconPath)
		if (!image) {
			image = makeIcon(iconPath)
			this.trayIconCache.set(iconPath, image)
		}
		return image
	}

	updateTrayIcon() {
		const icon = this.getCachedTrayImage(getTrayIconPath(this.trayState))
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

	async openURL(
		url: string,
		options: { notify?: boolean; fromQueue?: boolean } = {},
	): Promise<OpenURLResult> {
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
			const path = episodePathFromURL(cleanURL)
			await history.add({ name: data.name, url: cleanURL })
			this.push("history:changed", await history.read())
			this.upNext.setCurrent(path, Boolean(options.fromQueue))
			this.window.webContents.send("open-show", { ...data, path })
			return { ok: true }
		} catch (_err) {
			const message = "Could not open this NTS show URL"
			if (options.notify !== false) {
				this.evts.emit("error", message)
			}
			return { ok: false, error: message }
		}
	}

	// --- Up Next ---

	async handleShowEnded(episodePath: string | null) {
		// Ignore late events coming from a previous show's widget
		if (!episodePath || episodePath !== this.upNext.current) {
			return
		}
		const prefs = await preferences.read()
		if (!prefs.autoplay) {
			return
		}
		await this.playNext({ auto: true })
	}

	async playNext(options: { auto: boolean }) {
		const episode = await this.upNext.next()
		await this.playEpisode(episode, options.auto)
	}

	async playUpNext(path: string) {
		await this.playEpisode(this.upNext.take(path), false)
	}

	async playEpisode(episode: UpNextEpisode | null, notify: boolean) {
		if (!episode) {
			return
		}
		this.upNext.played.add(episode.path)
		const result = await this.openURL(episode.url, {
			notify: false,
			fromQueue: true,
		})
		if (!result.ok) {
			// Skip episodes that can't be loaded instead of stopping the chain
			if (notify) {
				await this.playNext({ auto: true })
			}
			return
		}
		if (notify) {
			const details = [episode.name, episode.location].filter(Boolean).join(" — ")
			this.showNotification(`Up next: ${details}`)
		}
	}

	async toggleAutoplay(autoplay: boolean) {
		await this.storePreferences({ autoplay })
		// Keep the renderer in sync, it sends the full preferences object on
		// every volume change and would otherwise overwrite this value
		await this.syncPreferences()
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
		shell.openExternal("https://github.com/dzndani/dznts")
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
		const merged = {
			...old,
			...prefs,
		}
		if (prefs.discordRPC !== undefined) {
			this.discordRPC.setEnabled(prefs.discordRPC)
		}
		await preferences.write(merged)
	}

	// --- Last.fm ---

	async lastfmConnect() {
		this.stopLastfmPolling()
		try {
			const token = await lastfm.getToken()
			this.lastfmToken = token
			shell.openExternal(lastfm.getAuthUrl(token))
			this.startLastfmPolling(token)
			await this.pushLastfmStatus()
		} catch (err) {
			console.warn("Last.fm connect failed:", err)
			this.showNotification("Could not connect to Last.fm")
		}
	}

	/**
	 * Polls auth.getSession only while a connection is pending (every 4s, up to
	 * 3 minutes). Outside of that there are no timers.
	 */
	private startLastfmPolling(token: string) {
		const deadline = Date.now() + 3 * 60_000
		let inFlight = false
		this.lastfmPoll = setInterval(async () => {
			if (inFlight) {
				return
			}
			if (this.lastfmToken !== token || Date.now() > deadline) {
				this.stopLastfmPolling()
				if (this.lastfmToken === token) {
					this.lastfmToken = null
				}
				void this.pushLastfmStatus()
				return
			}
			inFlight = true
			try {
				const session = await lastfm.getSession(token)
				if (this.lastfmToken === token) {
					await this.finishLastfmSession(session)
				}
			} catch (err) {
				// 14 = token not authorized yet; network errors are retried
				if (err instanceof lastfm.LastFmError && err.code !== 14) {
					this.stopLastfmPolling()
					this.lastfmToken = null
					this.showNotification("Last.fm authorization failed")
					void this.pushLastfmStatus()
				}
			} finally {
				inFlight = false
			}
		}, 4000)
	}

	private stopLastfmPolling() {
		if (this.lastfmPoll) {
			clearInterval(this.lastfmPoll)
			this.lastfmPoll = null
		}
	}

	private async finishLastfmSession(session: {
		sessionKey: string
		username: string
	}) {
		this.stopLastfmPolling()
		await lastfmSession.write(session)
		this.scrobbler.setSession(session.sessionKey)
		this.lastfmToken = null
		this.showNotification(`Last.fm connected as ${session.username}`)
		await this.pushLastfmStatus()
	}

	async lastfmConfirm() {
		if (!this.lastfmToken) {
			this.showNotification(
				"No pending Last.fm connection. Please click 'Connect Last.fm...' first.",
			)
			return
		}

		try {
			const session = await lastfm.getSession(this.lastfmToken)
			await this.finishLastfmSession(session)
		} catch (err) {
			console.warn("Last.fm confirm failed:", err)
			this.showNotification(
				"Could not complete Last.fm connection. Make sure you authorized the app in your browser.",
			)
		}
	}

	async lastfmCancel() {
		this.stopLastfmPolling()
		this.lastfmToken = null
		await this.pushLastfmStatus()
	}

	async lastfmDisconnect() {
		this.stopLastfmPolling()
		await lastfmSession.clear()
		this.scrobbler.clearSession()
		this.lastfmToken = null
		await this.pushLastfmStatus()
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

	window.webContents.setVisualZoomLevelLimits(1, 1)
	window.webContents.on("zoom-changed", (event) => {
		event.preventDefault()
	})
	window.webContents.on("before-input-event", (event, input) => {
		if (
			input.control &&
			(input.key === "=" ||
				input.key === "-" ||
				input.key === "+" ||
				input.key === "0" ||
				input.key === "numsub" ||
				input.key === "numadd")
		) {
			event.preventDefault()
		}
	})

	return window
}

function makeIcon(filename: string): NativeImage {
	const filepath = path.resolve(__dirname, filename)
	const original = nativeImage.createFromPath(filepath)
	if (process.platform === "win32") {
		return original
	}

	const size = original.getSize()
	const ratio = size.height > 0 ? size.width / size.height : 1
	const height = 18
	const icon = original.resize({
		height,
		width: Math.round(height * ratio * 10) / 10,
	})
	if (process.platform === "darwin") {
		icon.setTemplateImage(true)
	}
	return icon
}

function makeTray(icon: NativeImage): Tray {
	const tray = new Tray(icon)
	if (process.platform === "darwin") {
		tray.setIgnoreDoubleClickEvents(true)
	}
	return tray
}

function getTrayTheme(): TrayTheme {
	return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

function getTrayIconPath(state: TrayState): string {
	const icons = trayIcons[getTrayTheme()]
	if (state === 1) {
		return icons.one
	}
	if (state === 2) {
		return icons.two
	}
	return icons.idle
}

async function makeMenu(application: NTSApplication): Promise<Menu> {
	const h = await history.read()
	const hasCredentials = await credentials.has()
	const lfmSession = await lastfmSession.read()
	const lfmConfigured = lastfm.isConfigured()
	const hasPendingToken = Boolean(application.lastfmToken)
	const prefs = await preferences.read()
	const upcoming = application.upNext.peek(5)

	const upNextItems: Electron.MenuItemConstructorOptions[] = [
		{
			label: "Autoplay Up Next",
			type: "checkbox",
			checked: prefs.autoplay,
			click: (item) => void application.toggleAutoplay(item.checked),
		},
		{
			label: "Play Next",
			enabled: Boolean(application.upNext.current),
			click: () => void application.playNext({ auto: false }),
		},
		{
			label: "Up Next",
			enabled: upcoming.length > 0,
			submenu: upcoming.map((ep) => ({
				label: [ep.name, ep.date].filter(Boolean).join(" — "),
				click: () => void application.playUpNext(ep.path),
			})),
		},
	]

	const lastfmItems: Electron.MenuItemConstructorOptions[] = []
	if (lfmConfigured) {
		if (lfmSession) {
			lastfmItems.push({
				label: `Last.fm: Connected as ${lfmSession.username}`,
				enabled: false,
			})
			lastfmItems.push({
				label: "Disconnect Last.fm",
				click: () => void application.lastfmDisconnect(),
			})
		} else if (hasPendingToken) {
			lastfmItems.push({
				label: "Complete Last.fm Connection",
				click: () => void application.lastfmConfirm(),
			})
			lastfmItems.push({
				label: "Cancel Last.fm Connection",
				click: () => {
					application.lastfmToken = null
				},
			})
		} else {
			lastfmItems.push({
				label: "Connect Last.fm...",
				click: () => void application.lastfmConnect(),
			})
		}
	}

	return Menu.buildFromTemplate([
		{
			label: "About dzNTS",
			click: () => application.openAbout(),
		},
		{
			label: "Show dzNTS",
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
		...upNextItems,
		{ type: "separator" },
		...lastfmItems,
		...(lastfmItems.length > 0 ? [{ type: "separator" } as const] : []),
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
			label: "Reload dzNTS",
			click: () => application.reload(),
		},
		{ label: "Quit dzNTS", role: "quit" },
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
