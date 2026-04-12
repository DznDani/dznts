import { readFile, writeFile } from "node:fs/promises"

async function main() {
	const tag = process.env.RELEASE_TAG ?? ""
	if (!tag) {
		throw new Error("RELEASE_TAG is required")
	}

	const version = tag.replace(/^v/, "")
	if (!version) {
		throw new Error(`Invalid RELEASE_TAG: ${tag}`)
	}

	const packageJSON = JSON.parse(await readFile("package.json", "utf8"))
	packageJSON.version = version
	await writeFile("package.json", `${JSON.stringify(packageJSON, null, "\t")}\n`)

	console.log(`Set version to ${version}`)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
