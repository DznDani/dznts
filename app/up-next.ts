import fetch from "isomorphic-fetch"

// NTS's own "Up Next" recommendations (same source as the nts.live episode player).
// This is an undocumented Firebase callable function, so every failure is handled
// silently: if it breaks, playback simply stops at the end of the show as before.
const ENDPOINT =
	"https://europe-west2-nts-ios-app.cloudfunctions.net/getUpNextEpisodesEurope"

const NTS_ORIGIN = "https://www.nts.live"

export type UpNextEpisode = {
	name: string
	location: string
	date: string
	path: string
	url: string
}

type RawEpisode = {
	name?: string
	location_long?: string | null
	broadcast_datestr?: string | null
	show_alias?: string
	episode_alias?: string
	audio_sources?: unknown[]
}

/** Normalises an NTS episode URL to "/shows/<show>/episodes/<episode>". */
export function episodePathFromURL(url: string): string | null {
	const match = url.match(/nts\.live(\/shows\/[^/?#]+\/episodes\/[^/?#]+)/)
	return match ? match[1] : null
}

export async function fetchUpNext(episodePath: string): Promise<UpNextEpisode[]> {
	const resp = await fetch(ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			data: {
				deviceId: null,
				episodePath,
				playContext: null,
				collectionAlias: "",
			},
		}),
	})

	if (!resp.ok) {
		throw new Error(`Up Next request failed with status ${resp.status}`)
	}

	const json = (await resp.json()) as { result?: unknown }
	const list = Array.isArray(json?.result) ? (json.result as RawEpisode[]) : []

	return list
		.filter(
			(ep) =>
				ep?.show_alias &&
				ep?.episode_alias &&
				Array.isArray(ep.audio_sources) &&
				ep.audio_sources.length > 0,
		)
		.map((ep) => {
			const path = `/shows/${ep.show_alias}/episodes/${ep.episode_alias}`
			return {
				name: ep.name ?? "Unknown episode",
				location: ep.location_long ?? "",
				date: ep.broadcast_datestr ?? "",
				path,
				url: `${NTS_ORIGIN}${path}`,
			}
		})
}

export class UpNextQueue {
	current: string | null = null
	queue: UpNextEpisode[] = []
	played = new Set<string>()
	private pending: Promise<void> | null = null

	/**
	 * Called whenever a show is opened. When the show was not picked from the
	 * queue, the queue is discarded so recommendations follow the new episode.
	 */
	setCurrent(path: string | null, fromQueue: boolean) {
		this.current = path
		if (path) {
			this.played.add(path)
		}
		if (!fromQueue) {
			this.queue = []
		}
		this.queue = this.queue.filter((ep) => !this.played.has(ep.path))
		if (path && this.queue.length === 0) {
			void this.refill()
		}
	}

	refill(): Promise<void> {
		if (!this.current) {
			return Promise.resolve()
		}
		if (this.pending) {
			return this.pending
		}

		const base = this.current
		this.pending = fetchUpNext(base)
			.then((episodes) => {
				// The user switched shows while the request was in flight
				if (this.current !== base) {
					return
				}
				const queued = new Set(this.queue.map((ep) => ep.path))
				for (const ep of episodes) {
					if (!this.played.has(ep.path) && !queued.has(ep.path)) {
						this.queue.push(ep)
						queued.add(ep.path)
					}
				}
			})
			.catch((err) => console.warn("Up Next fetch failed", err))
			.finally(() => {
				this.pending = null
			})

		return this.pending
	}

	/** Takes the next episode, refilling the queue first if it is empty. */
	async next(): Promise<UpNextEpisode | null> {
		if (this.queue.length === 0) {
			await this.refill()
		}
		return this.queue.shift() ?? null
	}

	/** Takes a specific episode out of the queue (tray submenu click). */
	take(path: string): UpNextEpisode | null {
		const idx = this.queue.findIndex((ep) => ep.path === path)
		return idx >= 0 ? this.queue.splice(idx, 1)[0] : null
	}

	peek(count = 5): UpNextEpisode[] {
		return this.queue.slice(0, count)
	}
}
