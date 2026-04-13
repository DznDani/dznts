import { readFile, writeFile } from "node:fs/promises"

function extractVersionFromTag(tag) {
	const normalizedTag = `${tag}`.trim()

	const directVersionMatch = normalizedTag.match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/)
	if (directVersionMatch) {
		return directVersionMatch[1]
	}

	const preReleaseNameMatch = normalizedTag.match(/^pre\d+-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i)
	if (preReleaseNameMatch) {
		return preReleaseNameMatch[1]
	}

	throw new Error(`Invalid RELEASE_TAG: ${tag}`)
}

async function main() {
	const tag = process.env.RELEASE_TAG ?? ""
	if (!tag) {
		throw new Error("RELEASE_TAG is required")
	}

	const version = extractVersionFromTag(tag)

	const packageJSON = JSON.parse(await readFile("package.json", "utf8"))
	packageJSON.version = version
	await writeFile("package.json", `${JSON.stringify(packageJSON, null, "\t")}\n`)

	console.log(`Set version to ${version}`)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
