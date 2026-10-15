import type { Track } from "./show"

import * as lastfm from "./lastfm"
import * as lastfmSession from "./lastfm-session"

const MIN_TRACK_DURATION = 30
const MAX_SCROBBLE_POINT = 4 * 60

type ScrobbleTrack = {
	artist: string
	title: string
	start: number | null
	end: number | null
	duration: number | null
}

export class NTSLastFmScrobbler {
	private static readonly MAX_TRACK_CACHE = 200

	private tracklist: ScrobbleTrack[] = []
	private showName: string | null = null
	private activeTrackIndex: number | null = null
	private scrobbled: Set<number> = new Set()
	private trackListenStart: Map<number, number> = new Map()
	private sessionKey: string | null = null
	private enabled = false

	async init() {
		if (!lastfm.isConfigured()) {
			return
		}

		const session = await lastfmSession.read()
		if (session) {
			this.sessionKey = session.sessionKey
			this.enabled = true
		}
	}

	setSession(sessionKey: string) {
		this.sessionKey = sessionKey
		this.enabled = true
	}

	clearSession() {
		this.sessionKey = null
		this.enabled = false
		this.reset()
	}

	reset() {
		this.tracklist = []
		this.showName = null
		this.activeTrackIndex = null
		this.scrobbled.clear()
		this.trackListenStart.clear()
	}

	setShow(showName: string, tracklist: Track[]) {
		this.reset()
		this.showName = showName
		this.tracklist = tracklist.map((track) => {
			const start = track.offset ?? track.offset_estimate ?? null
			const duration = track.duration ?? track.duration_estimate ?? null
			const end = start !== null && duration !== null ? start + duration : null

			return {
				artist: track.artist || "Unknown",
				title: track.title || "Unknown",
				start,
				end,
				duration,
			}
		})
	}

	async update(position: number) {
		if (!this.enabled || !this.sessionKey || this.tracklist.length === 0) {
			return
		}

		const trackIndex = this.findActiveTrack(position)
		if (trackIndex === null) {
			return
		}

		// Track changed — send Now Playing
		if (trackIndex !== this.activeTrackIndex) {
			if (this.activeTrackIndex !== null) {
				this.trackListenStart.delete(this.activeTrackIndex)
			}
			this.activeTrackIndex = trackIndex
			this.trackListenStart.set(trackIndex, Date.now())
			await this.sendNowPlaying(trackIndex)
		}

		// Check if we should scrobble
		await this.checkScrobble(trackIndex, position)
	}

	private findActiveTrack(position: number): number | null {
		// Find the track whose offset range contains the current position
		for (let i = this.tracklist.length - 1; i >= 0; i--) {
			const track = this.tracklist[i]
			if (track.start !== null && position >= track.start) {
				return i
			}
		}

		// If no track has an offset that matches, try the first track
		if (this.tracklist.length > 0 && this.tracklist[0].start === null) {
			return 0
		}

		return null
	}

	private async sendNowPlaying(index: number) {
		const track = this.tracklist[index]
		if (!this.sessionKey) {
			return
		}

		try {
			await lastfm.updateNowPlaying({
				artist: track.artist,
				track: track.title,
				sessionKey: this.sessionKey,
				duration: track.duration ? Math.round(track.duration) : undefined,
			})
		} catch (err) {
			console.warn("Last.fm updateNowPlaying failed:", err)
		}
	}

	private async checkScrobble(index: number, position: number) {
		if (this.scrobbled.has(index)) {
			return
		}

		const track = this.tracklist[index]
		if (!track.duration || !this.sessionKey) {
			return
		}

		// Must have listened at least 30 seconds
		if (track.duration < MIN_TRACK_DURATION) {
			return
		}

		const listenStartTime = this.trackListenStart.get(index)
		if (!listenStartTime) {
			return
		}

		const listenedMs = Date.now() - listenStartTime
		const listenedSeconds = listenedMs / 1000

		// Scrobble at 50% of track duration or 4 minutes, whichever comes first
		const scrobblePoint = Math.min(track.duration / 2, MAX_SCROBBLE_POINT)

		if (listenedSeconds >= scrobblePoint) {
			this.markScrobbled(index)
			await this.sendScrobble(index)
		}
	}

	private markScrobbled(trackIndex: number) {
		if (this.scrobbled.size >= NTSLastFmScrobbler.MAX_TRACK_CACHE) {
			const oldestKey = this.scrobbled.values().next().value
			if (oldestKey !== undefined) {
				this.scrobbled.delete(oldestKey)
			}
		}
		this.scrobbled.add(trackIndex)
		this.trackListenStart.delete(trackIndex)
	}

	private async sendScrobble(index: number) {
		const track = this.tracklist[index]
		if (!this.sessionKey) {
			return
		}

		const timestamp = Math.floor(Date.now() / 1000)

		try {
			await lastfm.scrobble({
				artist: track.artist,
				track: track.title,
				timestamp,
				sessionKey: this.sessionKey,
				duration: track.duration ? Math.round(track.duration) : undefined,
			})
		} catch (err) {
			console.warn("Last.fm scrobble failed:", err)
		}
	}
}
