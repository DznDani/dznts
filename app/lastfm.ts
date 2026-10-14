import { createHash } from "node:crypto"
import fetch from "isomorphic-fetch"

// @ts-expect-error injected by esbuild define
const apiKey: string = LASTFM_API_KEY
// @ts-expect-error injected by esbuild define
const sharedSecret: string = LASTFM_SHARED_SECRET

const API_ROOT = "https://ws.audioscrobbler.com/2.0/"

type LastFmResponse = Record<string, unknown>

function generateApiSig(params: Record<string, string>): string {
	const keys = Object.keys(params).sort()
	let sigString = ""
	for (const key of keys) {
		sigString += key + params[key]
	}
	sigString += sharedSecret
	return createHash("md5").update(sigString, "utf8").digest("hex")
}

async function apiCall(
	params: Record<string, string>,
	method: "GET" | "POST" = "GET",
): Promise<LastFmResponse> {
	const allParams = { ...params, api_key: apiKey, format: "json" }

	if (method === "GET") {
		const qs = new URLSearchParams(allParams).toString()
		const resp = await fetch(`${API_ROOT}?${qs}`)
		return (await resp.json()) as LastFmResponse
	}

	const resp = await fetch(API_ROOT, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(allParams).toString(),
	})
	return (await resp.json()) as LastFmResponse
}

async function signedApiCall(
	params: Record<string, string>,
	method: "GET" | "POST" = "GET",
): Promise<LastFmResponse> {
	const paramsWithKey = { ...params, api_key: apiKey }
	const sig = generateApiSig(paramsWithKey)
	return apiCall({ ...paramsWithKey, api_sig: sig }, method)
}

// --- Authentication ---

export async function getToken(): Promise<string> {
	const result = await signedApiCall({ method: "auth.getToken" })
	if (result.error) {
		throw new Error(`Last.fm auth.getToken failed: ${result.message}`)
	}
	return result.token as string
}

export function getAuthUrl(token: string): string {
	return `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}`
}

export async function getSession(
	token: string,
): Promise<{ sessionKey: string; username: string }> {
	const result = await signedApiCall({
		method: "auth.getSession",
		token,
	})

	if (result.error) {
		throw new Error(`Last.fm auth.getSession failed: ${result.message}`)
	}

	const session = result.session as { key: string; name: string }
	return {
		sessionKey: session.key,
		username: session.name,
	}
}

// --- Scrobbling ---

export type ScrobbleParams = {
	artist: string
	track: string
	timestamp: number
	sessionKey: string
	album?: string
	duration?: number
}

export async function scrobble(params: ScrobbleParams): Promise<LastFmResponse> {
	const apiParams: Record<string, string> = {
		method: "track.scrobble",
		artist: params.artist,
		track: params.track,
		timestamp: String(params.timestamp),
		sk: params.sessionKey,
	}

	if (params.album) {
		apiParams.album = params.album
	}
	if (params.duration) {
		apiParams.duration = String(params.duration)
	}

	return signedApiCall(apiParams, "POST")
}

// --- Now Playing ---

export type NowPlayingParams = {
	artist: string
	track: string
	sessionKey: string
	album?: string
	duration?: number
}

export async function updateNowPlaying(
	params: NowPlayingParams,
): Promise<LastFmResponse> {
	const apiParams: Record<string, string> = {
		method: "track.updateNowPlaying",
		artist: params.artist,
		track: params.track,
		sk: params.sessionKey,
	}

	if (params.album) {
		apiParams.album = params.album
	}
	if (params.duration) {
		apiParams.duration = String(params.duration)
	}

	return signedApiCall(apiParams, "POST")
}

export function isConfigured(): boolean {
	return Boolean(apiKey && sharedSecret)
}
