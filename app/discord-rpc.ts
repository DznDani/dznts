import { Client } from "@xhayper/discord-rpc"
import { app } from "electron"

export type DiscordPresencePayload = {
	details: string
	state?: string
	startTimestamp?: number
	largeImageKey?: string
	largeImageText?: string
	smallImageKey?: string
	smallImageText?: string
	buttonUrl?: string
}

export class DiscordRPCService {
	private client: Client | null = null
	private clientId: string
	private isEnabled = true
	private isConnecting = false
	private lastPayload: DiscordPresencePayload | null = null
	private reconnectTimer: NodeJS.Timeout | null = null

	constructor(clientId?: string) {
		this.clientId = clientId?.trim() ?? ""
	}

	setClientId(clientId: string) {
		const clean = clientId.trim()
		if (this.clientId === clean) return
		this.clientId = clean
		this.clearReconnectTimer()
		if (this.client) {
			void this.destroy().then(() => {
				if (this.clientId && this.isEnabled && this.lastPayload) {
					void this.connectAndApply()
				}
			})
		}
	}

	setEnabled(enabled: boolean) {
		if (this.isEnabled === enabled) return
		this.isEnabled = enabled
		if (!enabled) {
			this.clearReconnectTimer()
			void this.destroy()
			void this.clearPresence()
		} else if (this.lastPayload) {
			void this.connectAndApply()
		}
	}

	async updatePresence(payload: DiscordPresencePayload | null) {
		this.lastPayload = payload

		if (!this.isEnabled) {
			return
		}

		if (!payload) {
			await this.clearPresence()
			return
		}

		await this.connectAndApply()
	}

	async clearPresence() {
		this.lastPayload = null
		this.clearReconnectTimer()
		if (this.client?.isConnected && this.client.user) {
			try {
				await this.client.user.clearActivity()
			} catch (err) {
				console.warn("Discord RPC: Failed to clear activity:", err)
			}
		}
	}

	private clearReconnectTimer() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
	}

	private async connectAndApply() {
		if (!this.isEnabled || !this.lastPayload || !this.clientId) {
			return
		}

		if (!this.client) {
			this.setupClient()
		}

		if (!this.client?.isConnected) {
			if (this.isConnecting) return
			this.isConnecting = true
			try {
				await this.client?.login()
			} catch (_err) {
				// Discord desktop client might not be running locally; retry later
				if (this.client) {
					this.client.removeAllListeners()
					await this.client.destroy().catch(() => {})
					this.client = null
				}
				this.scheduleReconnect()
				return
			} finally {
				this.isConnecting = false
			}
		}

		await this.applyActivity()
	}

	private setupClient() {
		if (!this.clientId) return
		if (this.client) {
			this.client.removeAllListeners()
			void this.client.destroy().catch(() => {})
			this.client = null
		}

		const client = new Client({ clientId: this.clientId })
		this.client = client

		client.on("ready", () => {
			this.clearReconnectTimer()
			if (this.lastPayload && this.client === client) {
				void this.applyActivity()
			}
		})

		client.on("disconnected", () => {
			if (this.client === client) {
				client.removeAllListeners()
				void client.destroy().catch(() => {})
				this.client = null
			}
			if (this.isEnabled && this.lastPayload) {
				this.scheduleReconnect()
			}
		})
	}

	private scheduleReconnect() {
		if (
			this.reconnectTimer ||
			!this.isEnabled ||
			!this.lastPayload ||
			!this.clientId
		) {
			return
		}
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			void this.connectAndApply()
		}, 15000)
	}

	private async applyActivity() {
		if (!this.client?.isConnected || !this.client.user || !this.lastPayload) {
			return
		}

		const payload = this.lastPayload
		const buttons = [
			...(payload.buttonUrl
				? [{ label: "Listen on NTS", url: payload.buttonUrl }]
				: []),
			{ label: "Get dzNTS", url: "https://github.com/DznDani/dznts" },
		]

		try {
			await this.client.user.setActivity({
				type: 2, // ActivityType.Listening -> "Listening to <App>"
				details: payload.details,
				state: payload.state,
				startTimestamp: payload.startTimestamp,
				largeImageKey: payload.largeImageKey ?? "nts-logo",
				largeImageText: payload.largeImageText,
				smallImageKey: payload.smallImageKey,
				smallImageText: payload.smallImageText,
				buttons,
			})
		} catch (err) {
			console.warn("Discord RPC: Failed to set activity:", err)
		}
	}

	async destroy() {
		this.clearReconnectTimer()
		this.isConnecting = false

		if (this.client) {
			const client = this.client
			this.client = null

			try {
				if (client.isConnected && client.user) {
					await client.user.clearActivity().catch(() => {})
				}
				client.removeAllListeners()
				await client.destroy().catch(() => {})
			} catch {
				// Ignore errors on shutdown
			}
		}
	}
}
