import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { constants } from "node:fs"

async function main() {
	await mkdir("dist", { recursive: true })

	const packageJSON = JSON.parse(await readFile("package.json", "utf8"))
	const {
		devDependencies: _devDependencies,
		scripts: _scripts,
		...distPackageJSON
	} = packageJSON

	await writeFile(
		"dist/package.json",
		`${JSON.stringify(distPackageJSON, null, "\t")}\n`,
	)

	try {
		await copyFile("pnpm-lock.yaml", "dist/pnpm-lock.yaml", constants.COPYFILE_FICLONE)
	} catch {
		await copyFile("pnpm-lock.yaml", "dist/pnpm-lock.yaml")
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
