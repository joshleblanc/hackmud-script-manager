#!/usr/bin/env node
import { Cache } from "@samual/lib/Cache"
import { assert } from "@samual/lib/assert"
import { countHackmudCharacters } from "@samual/lib/countHackmudCharacters"
import { writeFilePersistent } from "@samual/lib/writeFilePersistent"
import { readFile, writeFile } from "fs/promises"
import { homedir as getHomeDirectory } from "os"
import {
	basename as getPathBaseName, dirname as getPathDirectory, extname as getPathFileExtension,
	relative as getRelativePath, resolve as resolvePath
} from "path"
import type { Info } from ".."
import { version as moduleVersion } from "../../package.json"
import { supportedExtensions } from "../constants"
import { generateTypeDeclaration } from "../generateTypeDeclaration"
import { pull } from "../pull"
import { syncMacros } from "../syncMacros"

type ArgumentValue = boolean | number | string

const options = new Map<string, ArgumentValue>()
const commands: string[] = []

const userColours = new Cache<string, string>(user => {
	let hash = 0

	for (const char of user)
		hash += (hash >> 1) + hash + `xi1_8ratvsw9hlbgm02y5zpdcn7uekof463qj`.indexOf(char) + 1

	return [ colourJ, colourK, colourM, colourW, colourL, colourB ][hash % 6]!(user)
})

const log = (message: string) => console.log(colourS(message))

for (const argument of process.argv.slice(2)) {
	if (argument[0] == `-`) {
		const [ key, valueRaw ] = argument.split(`=`)
		let value: ArgumentValue | undefined = valueRaw

		if (value) {
			if (value == `true`)
				value = true
			else if (value == `false`)
				value = false
			else {
				const number = Number(value)

				if (isFinite(number))
					value = number
			}
		} else
			value = true

		if (argument[1] == `-`)
			options.set(key!.slice(2), value)
		else {
			for (const option of key!.slice(1))
				options.set(option, value)
		}
	} else
		commands.push(argument)
}

if (commands[0] == `v` || commands[0] == `version` || options.get(`version`) || options.get(`v`)) {
	console.log(moduleVersion)
	process.exit()
}

const pushModule = import(`../push`)
const processScriptModule = import(`../processScript`)
const watchModule = import(`../watch`)
const chokidarModule = import(`chokidar`)

const { default: chalk } = await import(`chalk`)

const colourA = chalk.rgb(0xFF, 0xFF, 0xFF)
const colourB = chalk.rgb(0xCA, 0xCA, 0xCA)
const colourC = chalk.rgb(0x9B, 0x9B, 0x9B)
const colourD = chalk.rgb(0xFF, 0x00, 0x00)
const colourJ = chalk.rgb(0xFF, 0xF4, 0x04)
const colourK = chalk.rgb(0xF3, 0xF9, 0x98)
const colourL = chalk.rgb(0x1E, 0xFF, 0x00)
const colourM = chalk.rgb(0xB3, 0xFF, 0x9B)
const colourN = chalk.rgb(0x00, 0xFF, 0xFF)
const colourS = chalk.rgb(0x7A, 0xB2, 0xF4)
const colourV = chalk.rgb(0xFF, 0x00, 0xEC)
const colourW = chalk.rgb(0xFF, 0x96, 0xE0)

if (options.get(`help`) || options.get(`h`)) {
	logHelp()
	process.exit()
}

let autoExit = true

switch (commands[0]) {
	case `push`: {
		const hackmudPath = getHackmudPath()
		const sourcePath = commands[1]

		if (!sourcePath) {
			logError(`Must provide the directory to push from\n`)
			logHelp()

			break
		}

		const scripts = commands.slice(2)

		if (scripts.length) {
			const invalidScript = scripts
				.find(script => !/^(?:[a-z_][a-z\d_]{0,24}|\*)\.(?:[a-z_][a-z\d_]{0,24}|\*)$/.test(script))

			if (invalidScript) {
				logError(`Invalid script name: ${JSON.stringify(invalidScript)}\n`)
				logHelp()

				break
			}
		} else
			scripts.push(`*.*`)

		const optionsHasNoMinify = options.has(`no-minify`)

		if ((optionsHasNoMinify || options.has(`skip-minify`)) && options.has(`mangle-names`)) {
			logError(`Options ${colourN(`--mangle-names`)} and ${
				colourN(optionsHasNoMinify ? `--no-minify` : `--skip-minify`)
			} are incompatible\n`)

			logHelp()

			break
		}

		const shouldSkipMinify = options.get(`no-minify`) || options.get(`skip-minify`)
		let shouldMinify

		if (shouldSkipMinify != undefined) {
			if (typeof shouldSkipMinify != `boolean`) {
				logError(`The value for ${colourN(optionsHasNoMinify ? `--no-minify` : `--skip-minify`)} must be ${
					colourV(`true`)
				} or ${colourV(`false`)}\n`)

				logHelp()

				break
			}

			shouldMinify = !shouldSkipMinify
		}

		const shouldMangleNames = options.get(`mangle-names`)

		if (shouldMangleNames != undefined && typeof shouldMangleNames != `boolean`) {
			logError(`The value for ${colourN(`--mangle-names`)} must be ${colourV(`true`)} or ${colourV(`false`)}\n`)
			logHelp()

			break
		}

		const shouldforceQuineCheats = options.get(`force-quine-cheats`)

		if (shouldforceQuineCheats != undefined && typeof shouldforceQuineCheats != `boolean`) {
			logError(`The value for ${colourN(`--force-quine-cheats`)} must be ${colourV(`true`)} or ${colourV(`false`)}\n`)
			logHelp()

			break
		}

		const { push } = await pushModule

		const infos = await push(sourcePath, hackmudPath, {
			scripts,
			onPush: info => logInfo(info, hackmudPath),
			minify: shouldMinify,
			mangleNames: shouldMangleNames,
			forceQuineCheats: shouldforceQuineCheats
		})

		if (!infos.length)
			logError(`Could not find any scripts to push`)
	} break

	case `dev`:
	case `watch`: {
		const hackmudPath = getHackmudPath()
		const sourcePath = commands[1]

		if (!sourcePath) {
			logError(`Must provide the directory to watch\n`)
			logHelp()

			break
		}

		const scripts = commands.slice(2)

		if (scripts.length) {
			const invalidScript = scripts
				.find(script => !/^(?:[a-z_][a-z\d_]{0,24}|\*)\.(?:[a-z_][a-z\d_]{0,24}|\*)$/.test(script))

			if (invalidScript) {
				logError(`Invalid script name: ${JSON.stringify(invalidScript)}\n`)
				logHelp()

				break
			}
		} else
			scripts.push(`*.*`)

		const optionsHasNoMinify = options.has(`no-minify`)

		if ((optionsHasNoMinify || options.has(`skip-minify`)) && options.has(`mangle-names`)) {
			logError(`Options ${colourN(`--mangle-names`)} and ${
				colourN(optionsHasNoMinify ? `--no-minify` : `--skip-minify`)
			} are incompatible\n`)

			logHelp()

			break
		}

		const shouldSkipMinify = options.get(`no-minify`) || options.get(`skip-minify`)
		let shouldMinify

		if (shouldSkipMinify != undefined) {
			if (typeof shouldSkipMinify != `boolean`) {
				logError(`The value for ${colourN(optionsHasNoMinify ? `--no-minify` : `--skip-minify`)} must be ${
					colourV(`true`)
				} or ${colourV(`false`)}\n`)

				logHelp()

				break
			}

			shouldMinify = !shouldSkipMinify
		}

		const shouldMangleNames = options.get(`mangle-names`)

		if (shouldMangleNames != undefined && typeof shouldMangleNames != `boolean`) {
			logError(`The value for ${colourN(`--mangle-names`)} must be ${colourV(`true`)} or ${colourV(`false`)}\n`)
			logHelp()

			break
		}

		const shouldforceQuineCheats = options.get(`force-quine-cheats`)

		if (shouldforceQuineCheats != undefined && typeof shouldforceQuineCheats != `boolean`) {
			logError(
				`The value for ${colourN(`--force-quine-cheats`)} must be ${colourV(`true`)} or ${colourV(`false`)}\n`
			)

			logHelp()

			break
		}

		const { watch } = await watchModule

		watch(sourcePath, hackmudPath, {
			scripts,
			onPush: info => logInfo(info, hackmudPath),
			typeDeclarationPath: (
				options.get(`type-declaration-path`) || options.get(`type-declaration`) || options.get(`dts`) ||
					options.get(`gen-types`)
			)?.toString(),
			minify: shouldMinify,
			mangleNames: shouldMangleNames,
			onReady: () => log(`Watching`),
			forceQuineCheats: shouldforceQuineCheats
		})

		autoExit = false
	} break

	case `pull`: {
		const hackmudPath = getHackmudPath()
		const script = commands[1]

		if (!script) {
			logError(`Must provide the script to pull\n`)
			logHelp()

			break
		}

		const sourcePath = commands[2] || `.`

		await pull(sourcePath, hackmudPath, script).catch(error => {
			console.error(error)
			logError(`Something went wrong, did you forget to ${colourC(`#down`)} the script?`)
		})
	} break

	case `sync-macros`: {
		const hackmudPath = getHackmudPath()
		const { macrosSynced, usersSynced } = await syncMacros(hackmudPath)

		log(`Synced ${macrosSynced} macros to ${usersSynced} users`)
	} break

	case `generate-type-declaration`:
	case `gen-type-declaration`:
	case `gen-dts`:
	case `gen-types`: {
		const target = commands[1]

		if (!target) {
			logError(`Must provide target directory\n`)
			logHelp()

			break
		}

		const sourcePath = resolvePath(target)
		const outputPath = commands[2] || `./player.d.ts`

		const typeDeclaration =
			await generateTypeDeclaration(sourcePath, getHackmudPath())

		let typeDeclarationPath = resolvePath(outputPath)

		await writeFile(typeDeclarationPath, typeDeclaration).catch(error => {
			assert(error instanceof Error, HERE)

			if (!((error as NodeJS.ErrnoException).code == `EISDIR`))
				throw error

			typeDeclarationPath = resolvePath(typeDeclarationPath, `player.d.ts`)

			return writeFile(typeDeclarationPath, typeDeclaration)
		})

		log(`Wrote type declaration to ${chalk.bold(typeDeclarationPath)}`)
	} break

	case `help`:
	case `h`: {
		logHelp()
	} break

	case `golf`:
	case `minify`: {
		const target = commands[1]

		if (!target) {
			logError(`Must provide target\n`)
			logHelp()

			break
		}

		const fileExtension = getPathFileExtension(target)

		if (!supportedExtensions.includes(fileExtension)) {
			logError(`Unsupported file extension "${chalk.bold(fileExtension)}"\nSupported extensions are "${
				supportedExtensions.map(extension => chalk.bold(extension)).join(`", "`)
			}"`)

			break
		}

		const { processScript } = await processScriptModule
		const fileBaseName = getPathBaseName(target, fileExtension)
		// eslint-disable-next-line unicorn/prevent-abbreviations -- the file extension is `src` not `source`
		const fileBaseNameEndsWithDotSrc = fileBaseName.endsWith(`.src`)
		const scriptName = fileBaseNameEndsWithDotSrc ? fileBaseName.slice(0, -4) : fileBaseName

		const scriptUser = (
			getPathBaseName(resolvePath(target, `..`)) == `scripts` &&
			getPathBaseName(resolvePath(target, `../../..`)) == `hackmud`
		) ? getPathBaseName(resolvePath(target, `../..`)) : undefined

		const optionsHasNoMinify = options.has(`no-minify`)

		if ((optionsHasNoMinify || options.has(`skip-minify`)) && options.has(`mangle-names`)) {
			logError(`Options ${colourN(`--mangle-names`)} and ${
				colourN(optionsHasNoMinify ? `--no-minify` : `--skip-minify`)
			} are incompatible\n`)

			logHelp()

			break
		}

		const mangleNames_ = options.get(`mangle-names`)

		if (mangleNames_ != undefined && typeof mangleNames_ != `boolean`) {
			logError(`The value for ${colourN(`--mangle-names`)} must be ${colourV(`true`)} or ${colourV(`false`)}\n`)
			logHelp()

			break
		}

		const mangleNames = mangleNames_
		const forceQuineCheats_ = options.get(`force-quine-cheats`)

		if (forceQuineCheats_ != undefined && typeof forceQuineCheats_ != `boolean`) {
			logError(`the value for ${colourN(`--force-quine-cheats`)} must be ${colourV(`true`)} or ${
				colourV(`false`)
			}\n`)

			logHelp()

			break
		}

		const forceQuineCheats = forceQuineCheats_

		let outputPath = commands[2] || resolvePath(
			getPathDirectory(target),
			fileBaseNameEndsWithDotSrc
				? `${scriptName}.js`
				: (fileExtension == `.js` ? `${fileBaseName}.min.js` : `${fileBaseName}.js`)
		)

		const golfFile = () => readFile(target, { encoding: `utf8` }).then(async source => {
			const timeStart = performance.now()

			const { script, warnings } = await processScript(source, {
				minify: !(options.get(`no-minify`) || options.get(`skip-minify`)),
				scriptUser,
				scriptName,
				filePath: target,
				mangleNames,
				forceQuineCheats
			})

			const timeTook = performance.now() - timeStart

			for (const { message, line } of warnings)
				log(`Warning "${chalk.bold(message)}" on line ${chalk.bold(String(line))}`)

			await writeFilePersistent(outputPath, script).catch((error: NodeJS.ErrnoException) => {
				if (!commands[2] || error.code != `EISDIR`)
					throw error

				outputPath = resolvePath(outputPath, `${getPathBaseName(target, fileExtension)}.js`)

				return writeFilePersistent(outputPath, script)
			}).then(() => log(`Wrote ${chalk.bold(countHackmudCharacters(script))} chars to ${
				chalk.bold(getRelativePath(`.`, outputPath))
			} | took ${Math.round(timeTook * 100) / 100}ms`))
		})

		if (options.get(`watch`)) {
			const { watch: watchFile } = await chokidarModule

			watchFile(target, { awaitWriteFinish: { stabilityThreshold: 100 } })
				.on(`ready`, () => log(`Watching ${target}`)).on(`change`, golfFile)

			autoExit = false
		} else
			await golfFile()
	} break

	default: {
		if (commands[0])
			logError(`Unknown command: ${colourL(commands[0])}\n`)

		logHelp()
	}
}

if (autoExit)
	process.exit()

function logHelp() {
	const pushCommandDescription = `Push scripts from a directory to hackmud user's scripts directories`
	const watchCommandDescription = `Watch a directory and push a script when modified`
	const minifyCommandDescription = `Minify a script file on the spot`
	const generateTypeDeclarationCommandDescription = `Generate a type declaration file for a directory of scripts`
	const syncMacrosCommandDescription = `Sync macros across all hackmud users`
	const pullCommandDescription = `Pull a script a from a hackmud user's script directory`

	const noMinifyOptionDescription = `Skip minification to produce a "readable" script`
	const mangleNamesOptionDescription = `Reduce character count further but lose function names in error call stacks`
	const forceQuineCheatsOptionDescription = `Force quine cheats on. Use ${colourN(`--force-quine-cheats`)}=${colourV(`false`)} to force off`

	const hackmudPathOption = `\
${colourN(`--hackmud-path`)}=${colourB(`<path>`)}
    Override hackmud path`

	console.log(colourN(`Version`) + colourS(`: `) + colourV(moduleVersion))

	switch (commands[0]) {
		case `dev`:
		case `watch`:
		case `push`: {
			console.log(colourS(`
${colourJ(commands[0] == `push` ? pushCommandDescription : watchCommandDescription)}

${colourA(`Usage:`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourB(`<directory> ["<script user>.<script name>"...]`)}

${colourA(`Arguments:`)}
${colourB(`<directory>`)}
    The source directory containing your scripts
${colourB(`<script user>`)}
    A user to push script(s) to. Can be set to wild card (${colourV(`*`)}) which will try
    and discover users to push to
${colourB(`<script name>`)}
    Name of a script to push. Can be set to wild card (${colourV(`*`)}) to find all scripts

${colourA(`Options:`)}
${colourN(`--no-minify`)}
    ${noMinifyOptionDescription}
${colourN(`--mangle-names`)}
    ${mangleNamesOptionDescription}
${colourN(`--force-quine-cheats`)}
    ${forceQuineCheatsOptionDescription}
${hackmudPathOption}
${commands[0] == `push` ? `` : `${colourN(`--type-declaration-path`)}=${colourB(`<path>`)}
    Path to generate a type declaration file for the scripts
`}\

${colourA(`Examples:`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)}
    Pushes all scripts found in ${colourV(`src`)} folder to all users
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)} ${colourC(`foo`)}${colourV(`.`)}${colourL(`bar`)}
    Pushes a script named ${colourL(`bar`)} found in ${colourV(`src`)} folder to user ${userColours.get(`foo`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)} ${colourC(`foo`)}${colourV(`.`)}${colourL(`bar`)} ${colourC(`baz`)}${colourV(`.`)}${colourL(`qux`)}
    Multiple can be specified
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)} ${colourC(`foo`)}${colourV(`.`)}${colourL(`*`)}
    Pushes all scripts found in ${colourV(`src`)} folder to user ${userColours.get(`foo`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)} ${colourC(`*`)}${colourV(`.`)}${colourL(`foo`)}
    Pushes all scripts named ${colourL(`foo`)} found in ${colourV(`src`)} folder to all user
${colourC(`hsm`)} ${colourL(commands[0])} ${colourV(`src`)} ${colourC(`*`)}${colourV(`.`)}${colourL(`*`)}
    Pushes all scripts found in ${colourV(`src`)} folder to all users`
			))
		} break

		case `pull`: {
			console.log(colourS(`
${colourJ(pullCommandDescription)}

${colourA(`Usage:`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourB(`<script user>`)}${colourV(`.`)}${colourB(`<script name>`)}

${colourA(`Options:`)}
${hackmudPathOption}`
			))
		} break

		case `minify`:
		case `golf`: {
			console.log(colourS(`
${colourJ(minifyCommandDescription)}

${colourA(`Usage:`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourB(`<target> [output path]`)}

${colourA(`Options:`)}
${colourN(`--no-minify`)}
    ${noMinifyOptionDescription}
${colourN(`--mangle-names`)}
    ${mangleNamesOptionDescription}
${colourN(`--force-quine-cheats`)}
    ${forceQuineCheatsOptionDescription}
${colourN(`--watch`)}
    Watch for changes`
			))
		} break

		case `generate-type-declaration`:
		case `gen-type-declaration`:
		case `gen-dts`:
		case `gen-types`: {
			console.log(colourS(`\
${colourJ(generateTypeDeclarationCommandDescription)}

${colourA(`Usage:`)}
${colourC(`hsm`)} ${colourL(commands[0])} ${colourB(`<directory> [output path]`)}

${colourA(`Options:`)}
${hackmudPathOption}`
			))
		} break

		case `sync-macros`: {
			console.log(colourS(`
${colourJ(syncMacrosCommandDescription)}

${colourA(`Options:`)}
${hackmudPathOption}`
			))
		} break

		default: {
			console.log(colourS(`
${colourJ(`Hackmud Script Manager`)}

${colourA(`Commands:`)}
${colourL(`push`)}
    ${pushCommandDescription}
${colourL(`dev`)}
    ${watchCommandDescription}
${colourL(`golf`)}
    ${minifyCommandDescription}
${colourL(`gen-dts`)}
    ${generateTypeDeclarationCommandDescription}
${colourL(`sync-macros`)}
    ${syncMacrosCommandDescription}
${colourL(`pull`)}
    ${pullCommandDescription}`
			))
		}
	}
}

function logInfo({ path, users, characterCount, error }: Info, hackmudPath: string) {
	path = getRelativePath(`.`, path)

	if (error) {
		logError(`Error "${chalk.bold(error.message)}" in ${chalk.bold(path)}`)

		return
	}

	log(`Pushed ${chalk.bold(path)} to ${users.map(user => chalk.bold(userColours.get(user))).join(`, `)} | ${
		chalk.bold(String(characterCount))
	} chars | ${chalk.bold(
		`${resolvePath(hackmudPath!, users[0]!, `scripts`, getPathBaseName(path, getPathFileExtension(path)))}.js`
	)}`)
}

function logError(message: string) {
	console.error(colourD(message))
	process.exitCode = 1
}

function getHackmudPath() {
	const hackmudPathOption = options.get(`hackmud-path`)

	if (hackmudPathOption != undefined && typeof hackmudPathOption != `string`) {
		logError(`Option ${colourN(`--hackmud-path`)} must be a string, got ${colourV(hackmudPathOption)}\n`)
		logHelp()
		process.exit(1)
	}

	return hackmudPathOption || process.env.HSM_HACKMUD_PATH || (process.platform == `win32`
		? resolvePath(process.env.APPDATA!, `hackmud`)
		: resolvePath(getHomeDirectory(), `.config/hackmud`)
	)
}
