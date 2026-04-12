import { type IpcMainInvokeEvent, type WebContents, ipcMain } from "electron"

import { type Stream, pathnameToStream, streamToPathname } from "~/lib/stream"

import * as credentials from "./credentials"

const LIMIT = 15

// @ts-expect-error
const rawConfig = FIREBASE_CONFIG

type FirebaseOptions = Record<string, unknown>

type SnapshotDocument = {
	data: () => Record<string, unknown>
}

type Snapshot = {
	forEach: (callback: (doc: SnapshotDocument) => void) => void
}

type FirebaseRuntime = {
	initializeApp: (options: FirebaseOptions) => unknown
	getAuth: (...args: any[]) => unknown
	signInWithEmailAndPassword: (...args: any[]) => Promise<unknown>
	getFirestore: (...args: any[]) => unknown
	collection: (...args: any[]) => unknown
	where: (...args: any[]) => unknown
	orderBy: (...args: any[]) => unknown
	limit: (...args: any[]) => unknown
	query: (...args: any[]) => unknown
	onSnapshot: (
		qry: any,
		onNext: (snapshot: Snapshot) => void,
		onError: (err: Error) => void,
	) => () => void
}

function parseFirebaseConfig(raw: unknown): FirebaseOptions | null {
	if (raw && typeof raw === "object") {
		return raw as FirebaseOptions
	}

	if (typeof raw === "string") {
		const value = raw.trim()
		if (!value) {
			return null
		}

		try {
			const parsed = JSON.parse(value)
			if (parsed && typeof parsed === "object") {
				return parsed as FirebaseOptions
			}
		} catch {
			return null
		}
	}

	return null
}

let firebaseRuntime: FirebaseRuntime | null = null
let auth: unknown | null = null
let store: unknown | null = null
let firebaseInitAttempted = false

async function ensureFirebaseRuntime(): Promise<boolean> {
	if (firebaseRuntime) {
		return true
	}

	if (firebaseInitAttempted) {
		return false
	}

	firebaseInitAttempted = true

	const config = parseFirebaseConfig(rawConfig)
	if (!config) {
		console.warn("Firebase config is missing. Live tracks login is disabled.")
		return false
	}

	try {
		const appMod = await import("firebase/app")
		const authMod = await import("firebase/auth")
		const firestoreMod = await import("firebase/firestore")

		const runtime: FirebaseRuntime = {
			initializeApp: appMod.initializeApp,
			getAuth: authMod.getAuth,
			signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
			getFirestore: firestoreMod.getFirestore,
			collection: firestoreMod.collection,
			where: firestoreMod.where,
			orderBy: firestoreMod.orderBy,
			limit: firestoreMod.limit,
			query: firestoreMod.query,
			onSnapshot: firestoreMod.onSnapshot,
		}

		const app = runtime.initializeApp(config)
		auth = runtime.getAuth(app)
		store = runtime.getFirestore(app)
		firebaseRuntime = runtime
		return true
	} catch (err) {
		console.warn("Firebase modules are unavailable. Live tracks login is disabled.", err)
		firebaseRuntime = null
		auth = null
		store = null
		return false
	}
}

export type LiveTrack = {
	title: string
	stream: Stream | null
	artists: string[]
	startTime: Date
}

type Handler = (err: Error | null, res: LiveTrack[] | null) => void

async function liveTracks(
	stream: 1 | 2,
	fn: Handler,
): Promise<() => void> {
	if (!firebaseRuntime || !store) {
		return () => {
			return
		}
	}

	const qry = firebaseRuntime.query(
		firebaseRuntime.collection(store, "live_tracks"),
		firebaseRuntime.where("stream_pathname", "==", streamToPathname(stream)),
		firebaseRuntime.orderBy("start_time", "desc"),
		firebaseRuntime.limit(LIMIT),
	)

	function handleSnapshot(snapshot: Snapshot) {
		const res: LiveTrack[] = []
		// biome-ignore lint/complexity/noForEach: we can't use for of here
		snapshot.forEach(function (doc) {
			const data = doc.data()
			const startTime = data.start_time as { toDate?: () => Date } | undefined
			const artists = Array.isArray(data.artist_names)
				? data.artist_names.map((artist) => String(artist))
				: []
			res.push({
				title: String(data.song_title ?? ""),
				artists,
				stream: pathnameToStream(String(data.stream_pathname ?? "")),
				startTime: startTime?.toDate?.() ?? new Date(0),
			})
		})
		fn(null, res)
	}

	function handleError(err: Error) {
		fn(err, null)
	}

	return firebaseRuntime.onSnapshot(qry, handleSnapshot, handleError)
}

export class NTSLiveTracks {
	webContents: WebContents

	promises: { [creds: string]: Promise<unknown> } = {}
	unsubscribe: null | (() => void)
	previous: {
		stream1: LiveTrack[]
		stream2: LiveTrack[]
	}

	creds: any | null

	constructor(webContents: WebContents) {
		this.webContents = webContents
		this.unsubscribe = null
		this.previous = {
			stream1: [],
			stream2: [],
		}

		ipcMain.handle("login-credentials", this._handleLogin.bind(this))
	}

	async init() {
		const enabled = await ensureFirebaseRuntime()
		if (!enabled) {
			return
		}

		this.creds = await credentials.read()
		if (!this.creds) {
			return
		}

		try {
			await this._auth()
		} catch (err) {
			console.warn("Could not authenticate live tracks at startup", err)
		}
	}

	async logout() {
		this.unsubscribe?.()
		this.creds = null
		await credentials.clear()
	}

	async subscribe() {
		const enabled = await ensureFirebaseRuntime()
		if (!enabled || !store) {
			return
		}

		const strm1 = await liveTracks(1, (err, res) => {
			if (err) {
				console.warn(err)
				return
			}
			if (!res) {
				return
			}

			this.webContents.send("live-tracks-1", res)
			this.previous.stream1 = res
		})

		const strm2 = await liveTracks(2, (err, res) => {
			if (err) {
				console.warn(err)
				return
			}
			if (!res) {
				return
			}

			this.previous.stream2 = res
			this.webContents.send("live-tracks-2", res)
		})

		this.unsubscribe = () => {
			this.unsubscribe = null
			strm1()
			strm2()
		}
	}

	async sync() {
		this.webContents.send("live-tracks-1", this.previous.stream1)
		this.webContents.send("live-tracks-2", this.previous.stream2)
	}

	async _auth() {
		await this._login(this.creds.email, this.creds.password)
	}

	async _login(email: string, password: string) {
		const enabled = await ensureFirebaseRuntime()
		if (!enabled || !firebaseRuntime || !auth) {
			throw new Error("Live tracks login is not available in this build")
		}

		const key = `${email}:${password}`
		if (!this.promises[key]) {
			this.promises[key] = firebaseRuntime.signInWithEmailAndPassword(
				auth,
				email,
				password,
			)
		}

		return this.promises[key]
	}

	async _handleLogin(
		_evt: IpcMainInvokeEvent,
		data: { email: string; password: string },
	) {
		const { email, password } = data

		try {
			await this._login(email, password)
			await credentials.write({ email, password })
			this.subscribe()
			return true
		} catch (err) {
			if (err instanceof Error) {
				throw err
			}
			throw new Error("could not log in")
		}
	}
}
