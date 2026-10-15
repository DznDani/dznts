import { useEffect, useRef } from "react"

import type { ShowInfo } from "~/app/show"
import type { InfoState } from "~/client/lib/live"
import type { Stream } from "~/lib/stream"
import { electron } from "~/client/electron"

export function useDiscordPresence(
	playing: Stream | "show" | null,
	show: ShowInfo | null,
	live: InfoState,
	enabled: boolean,
) {
	const lastSentKey = useRef<string | null>(null)
	const startTimeRef = useRef<number | null>(null)
	const currentPlayingRef = useRef<Stream | "show" | null>(null)

	useEffect(() => {
		if (!enabled || !playing) {
			if (lastSentKey.current !== null) {
				lastSentKey.current = null
				startTimeRef.current = null
				currentPlayingRef.current = null
				electron.send("discord:clear-presence")
			}
			return
		}

		// Reset start time if channel or show changed
		if (currentPlayingRef.current !== playing) {
			currentPlayingRef.current = playing
			startTimeRef.current = Date.now()
		}

		let details = "NTS Radio"
		let state = "Online"
		let smallImageKey: string | undefined
		let smallImageText: string | undefined
		let buttonUrl = "https://www.nts.live"

		if (playing === 1) {
			const now = live.data?.channel1.now
			details = now?.name ?? "Channel 1 Live"
			state = now?.location ? `📍 ${now.location}` : "📍 Live"
			smallImageKey = "channel-1"
			smallImageText = "Live on Channel 1"
			buttonUrl = "https://www.nts.live/1"
		} else if (playing === 2) {
			const now = live.data?.channel2.now
			details = now?.name ?? "Channel 2 Live"
			state = now?.location ? `📍 ${now.location}` : "📍 Live"
			smallImageKey = "channel-2"
			smallImageText = "Live on Channel 2"
			buttonUrl = "https://www.nts.live/2"
		} else if (playing === "show") {
			details = show?.name ?? "Archive Show"
			state = show?.location ? show.location : "Archive Episode"
			smallImageKey = "archive"
			smallImageText = "Archive Episode"
			if (show?.path) {
				const cleanPath = show.path.startsWith("/") ? show.path : `/${show.path}`
				buttonUrl = `https://www.nts.live${cleanPath}`
			} else if (show?.source?.url?.startsWith("http")) {
				buttonUrl = show.source.url
			}
		}

		const key = `${playing}:${details}:${state}:${buttonUrl}`
		if (lastSentKey.current === key) {
			return
		}

		lastSentKey.current = key

		electron.send("discord:update-presence", {
			details,
			state,
			startTimestamp: startTimeRef.current ?? Date.now(),
			largeImageKey: "nts-logo",
			smallImageKey,
			smallImageText,
			buttonUrl,
		})
	}, [playing, show, live.data, enabled])
}
