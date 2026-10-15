import { Fragment, useCallback, useEffect, useRef, useState } from "react"

import "./global.css"

import { type Stream, streams } from "~/lib/stream"

import { electron } from "./electron"
import { useLiveInfo } from "./lib/live"
import { useLiveTracks } from "./lib/live-tracks"
import { usePreferences } from "./lib/preferences"
import { useEvent } from "./lib/use-event"
import { useKeydown } from "./lib/use-keydown"
import { useOffline } from "./lib/use-offline"

import { useMetadata } from "./metadata"
import { useDiscordPresence } from "./lib/use-discord-presence"

import type { ShowInfo } from "../app/show"
import { ArchiveURLPrompt } from "./archive-url-prompt"
import { Arrow } from "./arrow"
import { Channel as ChannelCard } from "./channel"
import { Chat } from "./chat"
import { Help } from "./help"
import { Login } from "./login"
import { Mixcloud } from "./mixcloud"
import { Notifications, notify } from "./notifications"
import { Offline } from "./offline"
import { Player } from "./player"
import { Show } from "./show"
import { Settings, SettingsButton } from "./settings"
import { Slide, Slider } from "./slider"
import { Soundcloud } from "./soundcloud"
import { Splash } from "./splash"
import { Tracklist } from "./tracklist"
import { Volume } from "./volume"

import css from "./app.module.css"

type Channel = Stream | "show"

const channelToIndex: Record<Channel, number> = {
	1: 0,
	2: 1,
	show: 2,
}

const indexToChannel: Channel[] = [1, 2, "show"]

export function App() {
	const [route, setRoute] = useState<"app" | "login">("app")

	useEvent("login", () => setRoute("login"), [setRoute])
	useEvent("close", () => setRoute("app"), [setRoute])

	const handleLoginClose = useCallback(function () {
		setRoute("app")
	}, [])

	return (
		<Fragment>
			<NTS onRequestLogin={() => setRoute("login")} />
			<Login onClose={handleLoginClose} show={route === "login"} />
			<Notifications />
		</Fragment>
	)
}

type NTSProps = {
	onRequestLogin: () => void
}

export function NTS(props: NTSProps) {
	const { onRequestLogin } = props
	const [show, setShow] = useState<ShowInfo | null>(null)
	const [isExitingShow, setIsExitingShow] = useState(false)
	const exitShowTimeoutRef = useRef<number | null>(null)
	const { preferences, updatePreferences } = usePreferences()

	const [index, setIndex] = useState<number>(0)
	const [playing, setPlaying] = useState<Channel | null>(null)
	const [isOpen, setIsOpen] = useState(document.hasFocus())
	const [isShowingHelp, setIsShowingHelp] = useState(false)
	const [isArchiveURLPromptOpen, setIsArchiveURLPromptOpen] = useState(false)
	const [isSettingsOpen, setIsSettingsOpen] = useState(false)
	const [duration, setDuration] = useState(0)
	const [position, setPosition] = useState(0)
	const [looped, setLooped] = useState(0)
	const isOffline = useOffline()
	const live = useLiveInfo({ skip: isOffline })
	useMetadata(playing, show, live)
	useDiscordPresence(playing, show, live, preferences.discordRPC)

	const setVolume = useCallback(
		function (fn: (volume: number) => number) {
			updatePreferences((prefs) => ({ ...prefs, volume: fn(prefs.volume) }))
		},
		[updatePreferences],
	)

	const tracks1 = useLiveTracks(1)
	const tracks2 = useLiveTracks(2)
	const currentTracks = playing === 1 ? tracks1 : tracks2

	const next = useCallback(
		function () {
			if (isSettingsOpen || isArchiveURLPromptOpen || isExitingShow) {
				return
			}
			setIndex((idx) => (idx + 1) % 3)
		},
		[isArchiveURLPromptOpen, isExitingShow, isSettingsOpen],
	)

	const prev = useCallback(
		function () {
			if (isSettingsOpen || isArchiveURLPromptOpen || isExitingShow) {
				return
			}
			setIndex((idx) => (3 + idx - 1) % 3)
		},
		[isArchiveURLPromptOpen, isExitingShow, isSettingsOpen],
	)

	const togglePlaying = useCallback(
		function () {
			if (isOffline || isSettingsOpen || isArchiveURLPromptOpen || isExitingShow) {
				return
			}

			setPlaying((playing) => (playing ? null : indexToChannel[index]))
		},
		[index, isArchiveURLPromptOpen, isExitingShow, isOffline, isSettingsOpen],
	)

	const stop = useCallback(function (channel: Channel) {
		setPlaying((curr) => (curr === channel ? null : curr))
	}, [])

	const stopAll = useCallback(function () {
		setPlaying(null)
	}, [])

	const seek = useCallback(
		function (pos: number) {
			setPosition(pos)
			if (pos < position) {
				setLooped((x) => x + 1)
			}
		},
		[position],
	)

	const close = useCallback(
		function () {
			if (isSettingsOpen) {
				setIsSettingsOpen(false)
				return
			}

			if (isArchiveURLPromptOpen) {
				setIsArchiveURLPromptOpen(false)
				return
			}

			if (isExitingShow) {
				return
			}

			electron.send("close")
		},
		[isArchiveURLPromptOpen, isExitingShow, isSettingsOpen],
	)

	useEffect(
		function () {
			electron.send("playing", playing)
		},
		[playing],
	)

	const increaseVolume = useCallback(
		function () {
			setVolume((v: number): number => clamp(0, 1, v + 0.1))
		},
		[setVolume],
	)

	const decreaseVolume = useCallback(
		function () {
			setVolume((v: number): number => clamp(0, 1, v - 0.1))
		},
		[setVolume],
	)

	const isOverlayOpen =
		isSettingsOpen || isArchiveURLPromptOpen || isExitingShow
	useKeydown("ArrowRight", next)
	useKeydown("ArrowLeft", prev)
	useKeydown("?", () => {
		if (!isOverlayOpen) {
			setIsShowingHelp((x) => !x)
		}
	}, [isOverlayOpen])
	useKeydown(" ", togglePlaying, [playing, index, togglePlaying])
	useKeydown("Escape", close)
	useKeydown(
		"t",
		() => {
			if (!isOverlayOpen) {
				electron.send("tracklist", indexToChannel[index])
			}
		},
		[index, isOverlayOpen],
	)
	useKeydown(
		"c",
		() => {
			if (!isOverlayOpen) {
				electron.send("chat", indexToChannel[index])
			}
		},
		[index, isOverlayOpen],
	)
	useKeydown(
		"1",
		() => {
			if (!isOverlayOpen) {
				setPlaying(playing === 1 ? null : 1)
			}
		},
		[playing, isOverlayOpen],
	)
	useKeydown(
		"2",
		() => {
			if (!isOverlayOpen) {
				setPlaying(playing === 2 ? null : 2)
			}
		},
		[playing, isOverlayOpen],
	)
	useKeydown("+", increaseVolume)
	useKeydown("-", decreaseVolume)
	useKeydown("ArrowUp", increaseVolume)
	useKeydown("ArrowDown", decreaseVolume)

	useEvent("open-show", async function (show: ShowInfo) {
		if (exitShowTimeoutRef.current) {
			window.clearTimeout(exitShowTimeoutRef.current)
			exitShowTimeoutRef.current = null
		}
		setIsExitingShow(false)
		setShow(show)
		setPlaying("show")
		setIndex(channelToIndex.show)
		setPosition(0)
		setLooped(0)
	})

	useEvent("open", async function () {
		setIsOpen(true)
	})

	useEvent(
		"close",
		function () {
			setIsOpen(false)
			setIsArchiveURLPromptOpen(false)
			setIsSettingsOpen(false)

			if (!playing) {
				return
			}

			// Move the slider to the item that is currently playing
			const idx = channelToIndex[playing]
			setIndex(idx)
		},
		[playing],
	)

	useEffect(
		function () {
			if (isOffline) {
				stopAll()
			}
		},
		[isOffline, stopAll],
	)

	// --- Last.fm scrobbler integration ---
	const lastScrobbledShow = useRef<string | null>(null)

	// Send tracklist to scrobbler when a new show starts playing
	useEffect(
		function () {
			if (playing !== "show" || !show) {
				return
			}

			const showKey = show.source?.url ?? show.name
			if (lastScrobbledShow.current === showKey) {
				return
			}

			lastScrobbledShow.current = showKey
			electron.send("lastfm-scrobbler-update", {
				position,
				tracklist: show.tracklist,
				showName: show.name,
			})
		},
		[playing, show, position],
	)

	// Send position updates to scrobbler during show playback
	useEffect(
		function () {
			if (playing !== "show" || !show) {
				return
			}

			electron.send("lastfm-scrobbler-position", position)
		},
		[playing, show, position],
	)

	// Notify scrobbler when show playback stops
	useEffect(
		function () {
			if (playing !== "show") {
				lastScrobbledShow.current = null
				electron.send("lastfm-scrobbler-stop")
			}
		},
		[playing],
	)

	const handleShowTracklist = useCallback(function () {
		const all = document.querySelectorAll("[data-show]")
		for (const el of all) {
			el.scrollTo({
				top: 220,
				behavior: "smooth",
			})
		}
	}, [])

	const handleShowPlay = useCallback(function () {
		setPlaying("show")
	}, [])

	const handleShowStop = useCallback(
		function () {
			stop("show")
		},
		[stop],
	)

	// Let the main process decide whether to autoplay the next Up Next episode
	const showPath = show?.path ?? null
	const handleShowEnded = useCallback(
		function () {
			stop("show")
			electron.send("show-ended", showPath)
		},
		[stop, showPath],
	)

	const handleShowLoad = useCallback(function (dur: number) {
		setDuration(Math.round(dur))
	}, [])

	const handleShowProgress = useCallback(function (pos: number) {
		setPosition(Math.round(pos))
	}, [])

	const handleOpenArchiveURL = useCallback(async function () {
		setIsArchiveURLPromptOpen(true)
	}, [])

	const handleArchiveURLSubmit = useCallback(async function (url: string) {
		try {
			await electron.invoke("open-show-url", url)
			setIsArchiveURLPromptOpen(false)
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not open this NTS show URL"
			notify({ message, type: "error" })
		}
	}, [])

	useEvent(
		"open-archive-url",
		() => {
			void handleOpenArchiveURL()
		},
		[handleOpenArchiveURL],
	)

	const handleResumeShow = useCallback(async function (url: string) {
		try {
			await electron.invoke("open-show-url", url)
			setIsSettingsOpen(false)
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Could not open this NTS show URL"
			notify({ message, type: "error" })
		}
	}, [])

	const handleShowBack = useCallback(
		function () {
			if (isExitingShow) {
				return
			}
			if (playing === "show") {
				stop("show")
			}
			electron.send("show-closed")
			setIsExitingShow(true)

			if (exitShowTimeoutRef.current) {
				window.clearTimeout(exitShowTimeoutRef.current)
			}
			exitShowTimeoutRef.current = window.setTimeout(function () {
				setShow(null)
				setPosition(0)
				setDuration(0)
				setLooped(0)
				setIsExitingShow(false)
				exitShowTimeoutRef.current = null
			}, 200)
		},
		[isExitingShow, playing, stop],
	)

	useEffect(function () {
		return function () {
			if (exitShowTimeoutRef.current) {
				window.clearTimeout(exitShowTimeoutRef.current)
			}
		}
	}, [])

	const hasActiveShow = Boolean(show) && !isExitingShow

	return (
		<Fragment>
			<Splash hide={!live.loading} />
			<Slider index={index} animate={isOpen}>
				<Slide>
					<ChannelCard
						info={live.data?.channel1}
						channel={1}
						playing={playing === 1}
						onPlay={() => setPlaying(1)}
						onStop={stopAll}
						tracks={tracks1}
					/>
				</Slide>
				<Slide>
					<ChannelCard
						info={live.data?.channel2}
						channel={2}
						playing={playing === 2}
						onPlay={() => setPlaying(2)}
						onStop={stopAll}
						tracks={tracks2}
					/>
				</Slide>
				<Slide>
					<Show
						show={show}
						isExiting={isExitingShow}
						onPlay={() => setPlaying("show")}
						onStop={stopAll}
						onSeek={seek}
						playing={playing === "show"}
						duration={duration}
						position={position}
						onOpenArchiveURL={handleOpenArchiveURL}
						onBack={handleShowBack}
					/>
				</Slide>
			</Slider>
			<button type="button" onClick={prev} className={css.prev}>
				<Arrow direction="left" />
			</button>
			<button type="button" onClick={next} className={css.next}>
				<Arrow direction="right" />
			</button>
			<Tracklist
				channel={indexToChannel[index]}
				hasShow={hasActiveShow}
				onShowTracklist={handleShowTracklist}
				hasTracks={currentTracks.length > 0}
			/>
			<Chat channel={indexToChannel[index]} />
			<SettingsButton
				channel={indexToChannel[index]}
				hasShow={hasActiveShow}
				onClick={() => setIsSettingsOpen(true)}
			/>
			<Player
				src={streams[1]}
				playing={playing === 1}
				onPlay={() => setPlaying(1)}
				onStop={() => stop(1)}
				volume={preferences.volume}
			/>
			<Player
				src={streams[2]}
				playing={playing === 2}
				onPlay={() => setPlaying(2)}
				onStop={() => stop(2)}
				volume={preferences.volume}
			/>
			{show?.source?.source === "mixcloud" && (
				<Mixcloud
					key={`${show?.source?.url}_${looped}_mixcloud`}
					show={show}
					playing={playing === "show"}
					onPlay={handleShowPlay}
					onStop={handleShowStop}
					onEnded={handleShowEnded}
					onLoad={handleShowLoad}
					onProgress={handleShowProgress}
					position={position}
					volume={preferences.volume}
				/>
			)}
			{show?.source?.source === "soundcloud" && (
				<Soundcloud
					key={`${show?.source?.url}_soundcloud`}
					show={show}
					playing={playing === "show"}
					onPlay={handleShowPlay}
					onStop={handleShowStop}
					onEnded={handleShowEnded}
					onLoad={handleShowLoad}
					onProgress={handleShowProgress}
					position={position}
					volume={preferences.volume}
				/>
			)}
			<Offline hide={!isOffline} />
			<Help hide={!isShowingHelp} onHide={() => setIsShowingHelp(false)} />
			<ArchiveURLPrompt
				show={isArchiveURLPromptOpen}
				onClose={() => setIsArchiveURLPromptOpen(false)}
				onSubmit={handleArchiveURLSubmit}
			/>
			<Settings
				show={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
				onRequestLogin={onRequestLogin}
				onResumeShow={handleResumeShow}
			/>
			<Volume volume={preferences.volume} />
		</Fragment>
	)
}

function clamp(min: number, max: number, number: number): number {
	return Math.min(max, Math.max(min, number))
}
