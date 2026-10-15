import type { Entry } from "./history"
import type { UpNextState } from "./up-next"

export type { UpNextState }

export type LastFmStatus =
	| { state: "unavailable" } // no API key/secret in this build
	| { state: "disconnected" }
	| { state: "pending" } // waiting for authorization in the browser
	| { state: "connected"; username: string }

export type SettingsSnapshot = {
	version: string
	lastfm: LastFmStatus
	ntsLoggedIn: boolean
	history: Entry[]
	upNext: UpNextState
}

export type ExternalTarget = "schedule" | "favourites" | "about"
