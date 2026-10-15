import classnames from "classnames"
import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"

import { usePreferences } from "./lib/preferences"
import { useSettings } from "./lib/use-settings"

import css from "./settings.module.css"

type SettingsButtonProps = {
	onClick: () => void
	channel?: 1 | 2 | "show"
	hasShow?: boolean
}

export function SettingsButton(props: SettingsButtonProps) {
	const { onClick, channel, hasShow } = props
	const isCorner = channel === "show" && !hasShow
	const isSingle = channel === "show" && Boolean(hasShow)

	return (
		<button
			type="button"
			className={classnames(css.cog, isCorner && css.corner, isSingle && css.single)}
			onClick={onClick}
			aria-label="Settings"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M11 10.27 7 3.34" />
				<path d="m11 13.73-4 6.93" />
				<path d="M12 22v-2" />
				<path d="M12 2v2" />
				<path d="M14 12h8" />
				<path d="m17 20.66-1-1.73" />
				<path d="m17 3.34-1 1.73" />
				<path d="M2 12h2" />
				<path d="m20.66 17-1.73-1" />
				<path d="m20.66 7-1.73 1" />
				<path d="m3.34 17 1.73-1" />
				<path d="m3.34 7 1.73 1" />
				<circle cx="12" cy="12" r="2" />
				<circle cx="12" cy="12" r="8" />
			</svg>
		</button>
	)
}

type SettingsProps = {
	show: boolean
	onClose: () => void
	onRequestLogin: () => void
	onResumeShow: (url: string) => void
}

export function Settings(props: SettingsProps) {
	const { show, onClose, onRequestLogin, onResumeShow } = props
	const { preferences, updatePreferences } = usePreferences()
	const settings = useSettings(show)
	const { snapshot } = settings
	const rootRef = useRef<HTMLDivElement>(null)
	const [isHistoryOpen, setIsHistoryOpen] = useState(false)
	const [isUpNextOpen, setIsUpNextOpen] = useState(false)

	useEffect(
		function () {
			if (!show) {
				setIsHistoryOpen(false)
				setIsUpNextOpen(false)
				;(document.activeElement as HTMLElement)?.blur()
				return
			}
			const timer = window.setTimeout(() => rootRef.current?.focus(), 0)
			return () => window.clearTimeout(timer)
		},
		[show],
	)

	const handleClose = useCallback(
		function () {
			;(document.activeElement as HTMLElement)?.blur()
			onClose()
		},
		[onClose],
	)

	const handleKeyDown = useCallback(
		function (evt: KeyboardEvent<HTMLDivElement>) {
			if (evt.key === "Escape") {
				evt.preventDefault()
				handleClose()
			}
		},
		[handleClose],
	)

	const toggleAutoplay = useCallback(
		function () {
			updatePreferences((prefs) => ({ ...prefs, autoplay: !prefs.autoplay }))
		},
		[updatePreferences],
	)

	const toggleDiscordRPC = useCallback(
		function () {
			updatePreferences((prefs) => ({ ...prefs, discordRPC: !prefs.discordRPC }))
		},
		[updatePreferences],
	)

	const handleLogin = useCallback(
		function () {
			handleClose()
			onRequestLogin()
		},
		[handleClose, onRequestLogin],
	)

	const handleResume = useCallback(
		function (url: string) {
			onResumeShow(url)
		},
		[onResumeShow],
	)

	const lastfm = snapshot?.lastfm

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			className={classnames(css.settings, show && css.show)}
			onKeyDown={handleKeyDown}
			aria-hidden={!show}
		>
			<button type="button" className={css.back} onClick={handleClose}>
				Back
			</button>

			<div className={css.body}>
				<section className={css.section}>
					<h2>Playback</h2>
					<div className={css.row}>
						<span>Autoplay Up Next</span>
						<button
							type="button"
							role="switch"
							aria-checked={preferences.autoplay}
							className={classnames(css.switch, preferences.autoplay && css.on)}
							onClick={toggleAutoplay}
						>
							<span />
						</button>
					</div>
					<div className={css.row}>
						<span>Play next</span>
						<button
							type="button"
							className={css.action}
							disabled={!snapshot?.upNext.current}
							onClick={settings.playNext}
						>
							Play
						</button>
					</div>
				</section>

				<section className={css.section}>
					<button
						type="button"
						className={css.headerButton}
						onClick={() => setIsUpNextOpen((open) => !open)}
						aria-expanded={isUpNextOpen}
					>
						<h2>Up Next</h2>
						<svg
							viewBox="0 0 24 24"
							className={classnames(css.chevron, isUpNextOpen && css.chevronOpen)}
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					{isUpNextOpen && (
						<div className={css.collapsible}>
							{snapshot && snapshot.upNext.queue.length === 0 && (
								<p className={css.empty}>
									{snapshot.upNext.current
										? "Nothing queued"
										: "Not available for live shows"}
								</p>
							)}
							{snapshot?.upNext.queue.map((ep) => (
								<div className={css.row} key={ep.path}>
									<button
										type="button"
										className={css.item}
										title={ep.name}
										onClick={() => settings.playUpNext(ep.path)}
									>
										<span>{ep.name}</span>
										{ep.date && <small>{ep.date}</small>}
									</button>
									<button
										type="button"
										className={css.remove}
										aria-label={`Remove ${ep.name}`}
										onClick={() => settings.removeUpNext(ep.path)}
									>
										&times;
									</button>
								</div>
							))}
						</div>
					)}
				</section>

				<section className={css.section}>
					<h2>Accounts</h2>
					<div className={css.row}>
						<span>Discord Rich Presence</span>
						<button
							type="button"
							role="switch"
							aria-checked={preferences.discordRPC}
							className={classnames(css.switch, preferences.discordRPC && css.on)}
							onClick={toggleDiscordRPC}
						>
							<span />
						</button>
					</div>
					{lastfm?.state !== "unavailable" && (
						<div className={css.row}>
							<span>
								{lastfm?.state === "connected"
									? `Last.fm: ${lastfm.username}`
									: lastfm?.state === "pending"
										? "Last.fm: waiting for authorization..."
										: "Last.fm"}
							</span>
							{lastfm?.state === "connected" && (
								<button
									type="button"
									className={css.action}
									onClick={settings.disconnectLastfm}
								>
									Disconnect
								</button>
							)}
							{lastfm?.state === "pending" && (
								<button
									type="button"
									className={css.action}
									onClick={settings.cancelLastfm}
								>
									Cancel
								</button>
							)}
							{lastfm?.state === "disconnected" && (
								<button
									type="button"
									className={css.action}
									onClick={settings.connectLastfm}
								>
									Connect
								</button>
							)}
						</div>
					)}
					{lastfm?.state === "unavailable" && (
						<p className={css.empty}>Last.fm is not available in this build</p>
					)}
					<div className={css.row}>
						<span>NTS live tracks</span>
						{snapshot?.ntsLoggedIn ? (
							<button
								type="button"
								className={css.action}
								onClick={settings.logoutNTS}
							>
								Log out
							</button>
						) : (
							<button type="button" className={css.action} onClick={handleLogin}>
								Log in
							</button>
						)}
					</div>
				</section>

				<section className={css.section}>
					<button
						type="button"
						className={css.headerButton}
						onClick={() => setIsHistoryOpen((open) => !open)}
						aria-expanded={isHistoryOpen}
					>
						<h2>History</h2>
						<svg
							viewBox="0 0 24 24"
							className={classnames(css.chevron, isHistoryOpen && css.chevronOpen)}
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					{isHistoryOpen && (
						<div className={css.collapsible}>
							{snapshot && snapshot.history.length === 0 && (
								<p className={css.empty}>No shows yet</p>
							)}
							{snapshot?.history.map((entry) => (
								<div className={css.row} key={entry.url}>
									<button
										type="button"
										className={css.item}
										title={entry.name}
										onClick={() => handleResume(entry.url)}
									>
										<span>{entry.name}</span>
									</button>
								</div>
							))}
							<div className={css.row}>
								<span />
								<button
									type="button"
									className={css.action}
									disabled={!snapshot || snapshot.history.length === 0}
									onClick={settings.clearHistory}
								>
									Clear
								</button>
							</div>
						</div>
					)}
				</section>

				<section className={css.section}>
					<h2>About</h2>
					<div className={css.row}>
						<span>dzNTS {snapshot ? `v${snapshot.version}` : ""}</span>
						<button
							type="button"
							className={css.action}
							onClick={() => settings.openExternal("about")}
						>
							GitHub
						</button>
					</div>
					<div className={css.row}>
						<button
							type="button"
							className={css.action}
							onClick={() => settings.openExternal("schedule")}
						>
							Schedule
						</button>
						<button
							type="button"
							className={css.action}
							onClick={() => settings.openExternal("favourites")}
						>
							Favourites
						</button>
					</div>
				</section>
			</div>
		</div>
	)
}
