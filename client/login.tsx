import classnames from "classnames"
import { type FormEvent, useCallback } from "react"

import { electron } from "./electron"

import css from "./login.module.css"
import { notify } from "./notifications"

type LoginProps = {
	show: boolean
	onClose: () => void
}

export function Login(props: LoginProps) {
	const { show, onClose } = props

	const handleSubmit = useCallback(
		async function (evt: FormEvent<HTMLFormElement>) {
			evt.preventDefault()
			const data = new FormData(evt.target as HTMLFormElement)
			const email = data.get("email")?.toString() ?? null
			const password = data.get("password")?.toString() ?? null

			if (!email || !password) {
				return
			}

			try {
				await electron.invoke("login-credentials", { email, password })
				onClose()
			} catch (err) {
				const message = err instanceof Error ? err.message : "invalid credentials"
				notify({ message, ttl: 4000, type: "error" })
			}
		},
		[onClose],
	)

	return (
		<form
			className={classnames(css.login, show && css.show)}
			onSubmit={handleSubmit}
		>
			<button type="button" onClick={onClose}>
				Back
			</button>
			<input id="email" name="email" type="email" required placeholder="Email" />

			<input
				id="password"
				type="password"
				name="password"
				required
				placeholder="Password"
			/>

			<button type="submit">Log in</button>
		</form>
	)
}
