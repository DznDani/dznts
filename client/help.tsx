import classnames from "classnames"

import css from "./help.module.css"

type Props = {
	hide: boolean
	onHide: () => void
}

export function Help(props: Props) {
	const { hide } = props
	return (
		<div className={classnames(css.help, hide && css.hide)}>
			<p>
				Use the arrows on the side of the window to navigate between the channels.
				<br />
				You can also use the arrow keys.
			</p>
			<p>
				Click the channel number to play or pause the channel.
				<br />
				The spacebar also works.
			</p>
			<p>
				To play a show from the archive, choose "Load Archive Show URL..." from the
				tray menu or click "Open Archive Show URL" in the app, then paste an NTS
				show URL.
			</p>
			<p>
				On the archive show screen, you can scroll down to reveal the controls and
				tracklist.
			</p>
			<p>Click a track in the tracklist to copy the information to the clipboard.</p>
		</div>
	)
}
