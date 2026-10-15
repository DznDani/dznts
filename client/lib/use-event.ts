import { type DependencyList, useEffect, useRef } from "react"
import { electron } from "../electron"

export function useEvent<A>(
	name: string,
	handler: (...args: A[]) => void,
	deps: DependencyList = [],
) {
	const handlerRef = useRef(handler)

	useEffect(() => {
		handlerRef.current = handler
	})

	useEffect(() => {
		if (!name) {
			return
		}

		function handle(_evt: Event, ...args: A[]) {
			handlerRef.current(...args)
		}

		return electron.addListener(name, handle)
	}, [name, ...deps])
}
