import { useEffect, useRef } from "react"

type Props = {
	src: string
	playing: boolean
	onPlay: () => void
	onStop: () => void
	volume?: number
}

export function Player(props: Props) {
	const { src, playing, onStop, onPlay, volume = 1 } = props

	const ref = useRef<HTMLAudioElement | null>(null)
	const onPlayRef = useRef(onPlay)
	const onStopRef = useRef(onStop)

	useEffect(() => {
		onPlayRef.current = onPlay
		onStopRef.current = onStop
	})

	useEffect(function () {
		const audio = ref.current
		if (!audio) {
			return
		}

		function handlePlay() {
			onPlayRef.current()
		}

		function handlePause() {
			onStopRef.current()
		}

		function handleEnded() {
			onStopRef.current()
		}

		audio.addEventListener("play", handlePlay)
		audio.addEventListener("pause", handlePause)
		audio.addEventListener("ended", handleEnded)

		return () => {
			audio.removeEventListener("play", handlePlay)
			audio.removeEventListener("pause", handlePause)
			audio.removeEventListener("ended", handleEnded)
		}
	}, [])

	useEffect(
		function () {
			const audio = ref.current
			if (!audio) {
				return
			}

			if (!playing) {
				if (!audio.paused) {
					audio.pause()
				}
				audio.removeAttribute("src")
				audio.load()
				return
			}

			if (audio.getAttribute("src") !== src) {
				audio.src = src
			}

			void audio.play().catch((err: unknown) => {
				if (err instanceof DOMException && err.name === "AbortError") {
					return
				}
				console.warn("Could not start live stream playback", { src, err })
				onStopRef.current()
			})
		},
		[playing, src],
	)

	useEffect(function () {
		const audio = ref.current
		return () => {
			if (audio) {
				audio.pause()
				audio.removeAttribute("src")
				audio.load()
			}
		}
	}, [])

	useEffect(
		function () {
			if (!ref.current) {
				return
			}
			ref.current.volume = volume
		},
		[volume],
	)

	return <audio ref={ref} preload="none" src={playing ? src : undefined} />
}
