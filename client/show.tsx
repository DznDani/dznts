import { useCallback } from "react"

import type { ShowInfo } from "~/app/show"

import { Controls, formatDuration } from "./controls"
import { electron } from "./electron"
import { notify } from "./notifications"
import { Tracklist } from "./tracklist/index"

import css from "./show.module.css"

type Props = {
	show: ShowInfo | null
	onPlay: () => void
	onStop: () => void
	onSeek: (pos: number) => void
	playing: boolean
	duration: number
	position: number
	onOpenArchiveURL: () => Promise<void>
}

export function Show(props: Props) {
	const {
		show,
		onPlay,
		onStop,
		onSeek,
		playing,
		duration,
		position,
		onOpenArchiveURL,
	} = props

	const handleMyNTSClick = useCallback(function () {
		electron.send("my-nts")
	}, [])
	const handleExploreClick = useCallback(function () {
		electron.send("explore")
	}, [])

	const handleOpenArchiveClick = useCallback(async function () {
		try {
			await onOpenArchiveURL()
		} catch (_err) {
			notify({ message: "Could not open archive URL prompt", type: "error" })
		}
	}, [onOpenArchiveURL])

	if (!show) {
		return (
			<div className={css.empty}>
				<div>
					<svg viewBox="0 0 24 24">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
					</svg>
					<p>Enter an archive show URL to load an episode</p>
					<div className={css.nav}>
						<button type="button" onClick={handleOpenArchiveClick}>
							Open Archive Show URL
						</button>
						<button type="button" onClick={handleMyNTSClick}>
							My NTS
						</button>
						<button type="button" onClick={handleExploreClick}>
							Explore
						</button>
					</div>
				</div>
			</div>
		)
	}

	const { image, name, location, date, tracklist } = show

	return (
		<div className={css.show} data-show="true">
			<div className={css.top}>
				<img src={image} className={css.image} draggable={false} />
				<div className={css.header}>
					<div className={css.date}>{formatDate(date)}</div>
				</div>
				<div className={css.footer}>
					<div className={css.location}>{location}</div>
					<br />
					<span className={css.name}>{name}</span>
				</div>
			</div>

			<Controls
				show={show}
				duration={duration}
				position={position}
				playing={playing}
				onPlay={onPlay}
				onStop={onStop}
				onSeek={onSeek}
			/>
			{tracklist.length === 0 && (
				<div className={css.notracklist}>No tracklist provided</div>
			)}
			<Tracklist
				position={position}
				onSeek={onSeek}
				formatPosition={formatDuration}
				tracklist={tracklist.map(function (track) {
					const start = track.offset ?? track.offset_estimate ?? null
					const duration = track.duration ?? track.duration_estimate ?? null
					const end = start && duration ? start + duration : null

					return {
						title: track.title,
						artist: track.artist,
						start,
						end,
					}
				})}
			/>
		</div>
	)
}

function formatDate(date: Date): string {
	return date
		.toLocaleDateString("en-GB", {
			day: "2-digit",
			month: "2-digit",
			year: "2-digit",
		})
		.replace(/\//g, ".")
}
