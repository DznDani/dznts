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

	useEffect(
		function () {
			const audio = ref.current
			if (!audio) {
				return
			}

			function handlePlay() {
				onPlay()
			}

			function handlePause() {
				onStop()
			}

			function handleEnded() {
				onStop()
			}

			audio.addEventListener("play", handlePlay)
			audio.addEventListener("pause", handlePause)
			audio.addEventListener("ended", handleEnded)

			return () => {
				audio.removeEventListener("play", handlePlay)
				audio.removeEventListener("pause", handlePause)
				audio.removeEventListener("ended", handleEnded)
			}
		},
		[onPlay, onStop],
	)

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
				return
			}

			void audio.play().catch((err: unknown) => {
				console.warn("Could not start live stream playback", { src, err })
				onStop()
			})
		},
		[playing, onStop, src],
	)

	useEffect(
		function () {
			if (!ref.current) {
				return
			}
			ref.current.volume = volume
		},
		[volume],
	)

	return <audio src={src} ref={ref} />
}
