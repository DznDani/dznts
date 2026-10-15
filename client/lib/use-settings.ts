import { useCallback, useEffect, useState } from "react"

import type { Entry } from "~/app/history"
import type {
	ExternalTarget,
	LastFmStatus,
	SettingsSnapshot,
	UpNextState,
} from "~/app/settings-state"

import { electron } from "../electron"
import { notify } from "../notifications"
import { useEvent } from "./use-event"

export type { ExternalTarget, LastFmStatus, SettingsSnapshot, UpNextState }

async function call(channel: string, ...args: unknown[]) {
	try {
		await electron.invoke(channel, ...args)
	} catch (err) {
		const message = err instanceof Error ? err.message : "Something went wrong"
		notify({ message, type: "error" })
	}
}

/**
 * Loads the settings snapshot every time `active` becomes true and keeps it
 * up to date through the pushes sent by the main process.
 */
export function useSettings(active: boolean) {
	const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)

	useEffect(
		function () {
			if (!active) {
				return
			}

			let cancelled = false
			electron
				.invoke("settings:snapshot")
				.then((data: SettingsSnapshot) => {
					if (!cancelled) {
						setSnapshot(data)
					}
				})
				.catch(() => notify({ message: "Could not load settings", type: "error" }))

			return () => {
				cancelled = true
			}
		},
		[active],
	)

	useEvent("lastfm:status", (lastfm: LastFmStatus) =>
		setSnapshot((s) => (s ? { ...s, lastfm } : s)),
	)
	useEvent("credentials:status", (ntsLoggedIn: boolean) =>
		setSnapshot((s) => (s ? { ...s, ntsLoggedIn } : s)),
	)
	useEvent("upnext:changed", (upNext: UpNextState) =>
		setSnapshot((s) => (s ? { ...s, upNext } : s)),
	)
	useEvent("history:changed", (history: Entry[]) =>
		setSnapshot((s) => (s ? { ...s, history } : s)),
	)

	return {
		snapshot,
		connectLastfm: useCallback(() => call("lastfm:connect"), []),
		cancelLastfm: useCallback(() => call("lastfm:cancel"), []),
		disconnectLastfm: useCallback(() => call("lastfm:disconnect"), []),
		logoutNTS: useCallback(() => call("credentials:logout"), []),
		clearHistory: useCallback(() => call("history:clear"), []),
		playNext: useCallback(() => call("upnext:play-next"), []),
		playUpNext: useCallback((path: string) => call("upnext:play", path), []),
		removeUpNext: useCallback((path: string) => call("upnext:remove", path), []),
		openExternal: useCallback(
			(target: ExternalTarget) => electron.send("external:open", target),
			[],
		),
	}
}
