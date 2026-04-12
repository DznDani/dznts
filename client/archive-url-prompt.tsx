import classnames from "classnames"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"

import css from "./archive-url-prompt.module.css"

type ArchiveURLPromptProps = {
	show: boolean
	onClose: () => void
	onSubmit: (url: string) => Promise<void>
}

export function ArchiveURLPrompt(props: ArchiveURLPromptProps) {
	const { show, onClose, onSubmit } = props
	const inputRef = useRef<HTMLInputElement>(null)
	const [url, setURL] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(
		function () {
			if (!show) {
				setURL("")
				setIsSubmitting(false)
				return
			}

			const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
			return () => window.clearTimeout(timer)
		},
		[show],
	)

	const handleClose = useCallback(
		function () {
			if (isSubmitting) {
				return
			}
			onClose()
		},
		[isSubmitting, onClose],
	)

	const handleSubmit = useCallback(
		async function (evt: FormEvent<HTMLFormElement>) {
			evt.preventDefault()
			const cleanURL = url.trim()
			if (!cleanURL || isSubmitting) {
				return
			}

			setIsSubmitting(true)
			try {
				await onSubmit(cleanURL)
			} finally {
				setIsSubmitting(false)
			}
		},
		[isSubmitting, onSubmit, url],
	)

	return (
		<form
			className={classnames(css.prompt, show && css.show)}
			onSubmit={handleSubmit}
		>
			<button type="button" onClick={handleClose}>
				Back
			</button>
			<label htmlFor="archive-url">Archive show URL</label>
			<input
				id="archive-url"
				name="archive-url"
				type="url"
				ref={inputRef}
				required
				placeholder="https://www.nts.live/shows/..."
				value={url}
				onChange={(evt) => setURL(evt.target.value)}
			/>
			<button type="submit" disabled={isSubmitting || url.trim().length === 0}>
				{isSubmitting ? "Loading..." : "Load show"}
			</button>
		</form>
	)
}
