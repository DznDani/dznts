import classnames from "classnames"
import { useCallback } from "react"

import type { ShowInfo } from "~/app/show"

import { Controls, formatDuration } from "./controls"
import { electron } from "./electron"
import { notify } from "./notifications"
import { Tracklist } from "./tracklist/index"

import css from "./show.module.css"

type Props = {
	show: ShowInfo | null
	isExiting?: boolean
	onPlay: () => void
	onStop: () => void
	onSeek: (pos: number) => void
	playing: boolean
	duration: number
	position: number
	onOpenArchiveURL: () => Promise<void>
	onBack?: () => void
}

export function Show(props: Props) {
	const {
		show,
		isExiting = false,
		onPlay,
		onStop,
		onSeek,
		playing,
		duration,
		position,
		onOpenArchiveURL,
		onBack,
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

	return (
		<div className={css.container}>
			<div
				className={classnames(css.empty, Boolean(show) && css.inactive)}
				aria-hidden={Boolean(show)}
			>
				<div>
					<svg viewBox="0 0 24 24">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
					</svg>
					<p>Enter an archive show URL to load an episode</p>
					<div className={css.nav}>
						<button
							type="button"
							onClick={handleOpenArchiveClick}
							tabIndex={show ? -1 : 0}
						>
							Open Archive Show URL
						</button>
						<button
							type="button"
							onClick={handleMyNTSClick}
							tabIndex={show ? -1 : 0}
						>
							My NTS
						</button>
						<button
							type="button"
							onClick={handleExploreClick}
							tabIndex={show ? -1 : 0}
						>
							Explore
						</button>
					</div>
				</div>
			</div>

			{show && (
				<div
					className={classnames(css.show, isExiting && css.exiting)}
					data-show="true"
				>
					<div className={css.top}>
						<img src={show.image} className={css.image} draggable={false} />
						<div className={css.header}>
							<button
								type="button"
								className={css.back}
								onClick={onBack}
								aria-label="Back to archive menu"
								disabled={isExiting}
							>
								Back
							</button>
						</div>
						<div className={css.footer}>
							<div className={css.meta}>
								<div className={css.date}>{formatDate(show.date)}</div>
								{Boolean(show.location) && (
									<div className={css.location}>{show.location}</div>
								)}
							</div>
							<span className={css.name}>{show.name}</span>
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
					{show.tracklist.length === 0 && (
						<div className={css.notracklist}>No tracklist provided</div>
					)}
					<Tracklist
						position={position}
						onSeek={onSeek}
						formatPosition={formatDuration}
						tracklist={show.tracklist.map(function (track) {
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
			)}
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
