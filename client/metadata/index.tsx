import { useEffect } from "react"

import type { ShowInfo } from "~/app/show"
import type { InfoState } from "~/client/lib/live"
import type { Stream } from "~/lib/stream"

const artwork = [
	{
		type: "image/png",
		src: "https://raw.githubusercontent.com/dzndani/dznts/refs/heads/main/logos/logo.png",
	},
]

export function useMetadata(
	playing: Stream | "show" | null,
	show: ShowInfo | null,
	live: InfoState,
) {
	useEffect(
		function () {
			if (!playing) {
				document.title = "dzNTS"
				navigator.mediaSession.metadata = null
				return
			}

			if (playing === 1) {
				if (live.data) {
					const title = `dzNTS - NTS 1 - ${live.data?.channel1.now.name}`
					document.title = title
					navigator.mediaSession.metadata = new MediaMetadata({
						title,
						artwork,
					})
				} else {
					document.title = "dzNTS - NTS 1"
					navigator.mediaSession.metadata = null
				}
			}
			if (playing === 2) {
				if (live.data) {
					const title = `dzNTS - NTS 2 - ${live.data?.channel2.now.name}`
					document.title = title
					navigator.mediaSession.metadata = new MediaMetadata({
						title,
						artwork,
					})
				} else {
					document.title = "dzNTS - NTS 2"
					navigator.mediaSession.metadata = null
				}
			}
			if (playing === "show") {
				if (show) {
					const title = `dzNTS - ${show.name}`
					document.title = title
					navigator.mediaSession.metadata = new MediaMetadata({
						title,
						artwork,
					})
				} else {
					document.title = "dzNTS"
					navigator.mediaSession.metadata = null
				}
			}
		},
		[playing, show, live],
	)
}
