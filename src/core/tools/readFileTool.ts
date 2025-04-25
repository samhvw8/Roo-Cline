import path from "path"
import { isBinaryFile } from "isbinaryfile"

import { Cline } from "../Cline"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { getReadablePath } from "../../utils/path"
import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"

// Types
interface FileEntry {
	path?: string
	start_line?: number
	end_line?: number
}

export async function readFileTool(
	cline: Cline,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const args: string | undefined = block.params.args

	// Handle partial message first
	if (block.partial) {
		let filePath = ""
		if (args) {
			const firstEntry = args.split("======+++======")[0].trim()
			const lines = firstEntry.split("\n")
			for (const line of lines) {
				// Skip empty lines
				if (!line.trim()) continue

				// Remove leading : and split on first :
				if (line.startsWith(":")) {
					const [key, ...rest] = line.substring(1).split(":")
					if (key === "path") {
						filePath = rest.join(":").trim()
						break
					}
				}
			}
		}

		const fullPath = filePath ? path.resolve(cline.cwd, filePath) : ""
		const sharedMessageProps: ClineSayTool = {
			tool: "readFile",
			path: getReadablePath(cline.cwd, filePath),
			isOutsideWorkspace: filePath ? isPathOutsideWorkspace(fullPath) : false,
		}
		const partialMessage = JSON.stringify({
			...sharedMessageProps,
			content: undefined,
		} satisfies ClineSayTool)
		await cline.ask("tool", partialMessage, block.partial).catch(() => {})
		return
	}

	if (!args) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("read_file")
		const errorMsg = await cline.sayAndCreateMissingParamError("read_file", "args")
		pushToolResult(`<files><error>${errorMsg}</error></files>`)
		return
	}

	// Parse file entries from args
	const fileEntries: FileEntry[] = []

	// Check if we have multiple files (contains separator)
	const entries = args.includes("======+++======") ? args.split("======+++======") : [args]

	for (const entry of entries) {
		const fileEntry: FileEntry = {}
		const lines = entry.trim().split("\n")

		for (const line of lines) {
			// Skip empty lines
			if (!line.trim()) continue

			// Remove leading : and split on first :
			if (line.startsWith(":")) {
				const [key, ...rest] = line.substring(1).split(":")
				if (key === "path") {
					fileEntry.path = rest.join(":").trim()
				} else if (key === "start_line") {
					fileEntry.start_line = parseInt(rest.join(":").trim())
				} else if (key === "end_line") {
					fileEntry.end_line = parseInt(rest.join(":").trim())
				}
			}
		}

		if (fileEntry.path) {
			fileEntries.push(fileEntry)
		}
	}

	if (fileEntries.length === 0) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("read_file")
		const errorMsg = await cline.sayAndCreateMissingParamError("read_file", "args")
		pushToolResult(`<files><error>${errorMsg}</error></files>`)
		return
	}

	const results: string[] = []

	try {
		// Validate line ranges first
		for (const entry of fileEntries) {
			if (entry.start_line !== undefined && entry.end_line !== undefined && entry.start_line > entry.end_line) {
				throw new Error("Invalid line range: end line cannot be less than start line")
			}
			if (entry.start_line !== undefined && isNaN(entry.start_line)) {
				throw new Error("Invalid start_line value")
			}
			if (entry.end_line !== undefined && isNaN(entry.end_line)) {
				throw new Error("Invalid end_line value")
			}
		}

		// First check RooIgnore validation for all files
		const blockedFiles = new Set<string>()
		for (const entry of fileEntries) {
			const relPath = entry.path || ""
			const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await cline.say("rooignore_error", relPath)
				const errorMsg = formatResponse.rooIgnoreError(relPath)
				results.push(`<file><path>${relPath}</path><error>${errorMsg}</error></file>`)
				blockedFiles.add(relPath)
			}
		}

		// Then process only allowed files
		for (const entry of fileEntries) {
			const relPath = entry.path || ""
			const fullPath = path.resolve(cline.cwd, relPath)

			// Skip files that failed RooIgnore validation
			if (blockedFiles.has(relPath)) {
				continue
			}

			// Get approval after RooIgnore check but before file operations
			const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)
			const { maxReadFileLine = 500 } = (await cline.providerRef.deref()?.getState()) ?? {}

			// Create line snippet for approval message
			let lineSnippet = ""
			if (entry.start_line !== undefined && entry.end_line !== undefined) {
				lineSnippet = t("tools:readFile.linesRange", { start: entry.start_line, end: entry.end_line })
			} else if (entry.start_line !== undefined) {
				lineSnippet = t("tools:readFile.linesFromToEnd", { start: entry.start_line })
			} else if (entry.end_line !== undefined) {
				lineSnippet = t("tools:readFile.linesFromStartTo", { end: entry.end_line })
			} else if (maxReadFileLine === 0) {
				lineSnippet = t("tools:readFile.definitionsOnly")
			} else if (maxReadFileLine > 0) {
				lineSnippet = t("tools:readFile.maxLines", { max: maxReadFileLine })
			}

			const completeMessage = JSON.stringify({
				tool: "readFile",
				path: getReadablePath(cline.cwd, relPath),
				isOutsideWorkspace,
				content: fullPath,
				reason: lineSnippet,
			} satisfies ClineSayTool)

			const didApprove = await askApproval("tool", completeMessage)
			if (!didApprove) {
				continue
			}

			// Only attempt file operations if access is allowed and approved
			try {
				const [totalLines, isBinary] = await Promise.all([countFileLines(fullPath), isBinaryFile(fullPath)])

				// Handle binary files
				if (isBinary) {
					results.push(`<file><path>${relPath}</path>\n<notice>Binary file</notice>\n</file>`)
					continue
				}

				// Handle range reads (bypass maxReadFileLine)
				if (entry.start_line !== undefined && entry.end_line !== undefined) {
					const content = addLineNumbers(
						await readLines(fullPath, entry.end_line - 1, entry.start_line - 1),
						entry.start_line,
					)
					const lineRangeAttr = ` lines="${entry.start_line}-${entry.end_line}"`
					results.push(
						`<file><path>${relPath}</path>\n<content${lineRangeAttr}>\n${content}</content>\n</file>`,
					)
					continue
				}

				// Handle definitions-only mode
				if (maxReadFileLine === 0) {
					const defResult = await parseSourceCodeDefinitionsForFile(fullPath, cline.rooIgnoreController)
					if (defResult) {
						results.push(
							`<file><path>${relPath}</path>\n<list_code_definition_names>${defResult}</list_code_definition_names>\n</file>`,
						)
					}
					continue
				}

				// Handle files exceeding line threshold
				if (maxReadFileLine > 0 && totalLines > maxReadFileLine) {
					const content = addLineNumbers(await readLines(fullPath, maxReadFileLine - 1, 0))
					const lineRangeAttr = ` lines="1-${maxReadFileLine}"`
					let xmlInfo = `<content${lineRangeAttr}>\n${content}</content>\n`

					const defResult = await parseSourceCodeDefinitionsForFile(fullPath, cline.rooIgnoreController)
					if (defResult) {
						xmlInfo += `<list_code_definition_names>${defResult}</list_code_definition_names>\n`
					}
					xmlInfo += `<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n`
					results.push(`<file><path>${relPath}</path>\n${xmlInfo}</file>`)
					continue
				}

				// Handle normal file read
				const content = await extractTextFromFile(fullPath)
				const lineRangeAttr = ` lines="1-${totalLines}"`
				let xmlInfo = totalLines > 0 ? `<content${lineRangeAttr}>\n${content}</content>\n` : `<content/>`

				if (totalLines === 0) {
					xmlInfo += `<notice>File is empty</notice>\n`
				}

				// Track file read
				await cline.getFileContextTracker().trackFileContext(relPath, "read_tool" as RecordSource)

				results.push(`<file><path>${relPath}</path>\n${xmlInfo}</file>`)
			} catch (error) {
				await handleFileError(error, relPath, fileEntries.length === 1, results, handleError)
			}
		}

		// Push combined results
		pushToolResult(`<files>\n${results.join("\n")}\n</files>`)
	} catch (error) {
		await handleGlobalError(error, pushToolResult, handleError)
	}
}

// Error handling functions
async function handleFileError(
	error: unknown,
	relPath: string,
	isOnlyFile: boolean,
	results: string[],
	handleError: HandleError,
): Promise<void> {
	// Re-throw file not found errors if this is the only file
	if (
		isOnlyFile &&
		error instanceof Error &&
		(error.message.includes("no such file") || error.message === "File not found")
	) {
		throw new Error("File not found")
	}
	// Handle other file read errors per-file
	const errorMsg = error instanceof Error ? error.message : String(error)
	results.push(`<file><path>${relPath}</path><error>Error reading file: ${errorMsg}</error></file>`)
	await handleError(`reading file ${relPath}`, error instanceof Error ? error : new Error(errorMsg))
}

async function handleGlobalError(
	error: unknown,
	pushToolResult: PushToolResult,
	handleError: HandleError,
): Promise<void> {
	const errorMsg = error instanceof Error ? error.message : String(error)
	pushToolResult(`<files><error>Error reading files: ${errorMsg}</error></files>`)
	await handleError("reading files", error instanceof Error ? error : new Error(errorMsg))
}
