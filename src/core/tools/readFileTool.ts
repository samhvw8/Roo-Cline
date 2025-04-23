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
	const fileEntries: Array<{ path?: string; start_line?: number; end_line?: number }> = []

	// Check if we have multiple files (contains separator)
	const entries = args.includes("======+++======") ? args.split("======+++======") : [args]

	for (const entry of entries) {
		const fileEntry: { path?: string; start_line?: number; end_line?: number } = {}
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
		for (const entry of fileEntries) {
			const relPath = entry.path || ""
			const fullPath = path.resolve(cline.cwd, relPath)
			const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

			// Check access permissions
			const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)
			if (!accessAllowed) {
				await cline.say("rooignore_error", relPath)
				const errorMsg = formatResponse.rooIgnoreError(relPath)
				results.push(`<file><path>${relPath}</path><error>${errorMsg}</error></file>`)
				continue
			}

			const { maxReadFileLine = 500 } = (await cline.providerRef.deref()?.getState()) ?? {}
			const isFullRead = maxReadFileLine === -1

			// Convert line numbers to 0-based
			const startLine = entry.start_line !== undefined ? entry.start_line - 1 : undefined
			const endLine = entry.end_line !== undefined ? entry.end_line - 1 : undefined
			const isRangeRead = !isFullRead && (startLine !== undefined || endLine !== undefined)

			// Create line snippet for approval message
			let lineSnippet = ""
			if (startLine !== undefined && endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesRange", { start: startLine + 1, end: endLine + 1 })
			} else if (startLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromToEnd", { start: startLine + 1 })
			} else if (endLine !== undefined) {
				lineSnippet = t("tools:readFile.linesFromStartTo", { end: endLine + 1 })
			} else if (maxReadFileLine === 0) {
				lineSnippet = t("tools:readFile.definitionsOnly")
			} else if (maxReadFileLine > 0) {
				lineSnippet = t("tools:readFile.maxLines", { max: maxReadFileLine })
			}

			// Get approval
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

			// Process file content
			const totalLines = await countFileLines(fullPath).catch(() => 0)
			const isBinary = await isBinaryFile(fullPath).catch(() => false)

			let content: string
			let xmlInfo = ""
			let contentTag = ""

			let isFileTruncated = false
			let sourceCodeDef = ""

			// Handle binary files
			if (isBinary) {
				xmlInfo += `<notice>Binary file</notice>\n`
				results.push(`<file><path>${relPath}</path>\n${contentTag}${xmlInfo}</file>`)
				continue
			}

			// Handle range reads (bypass maxReadFileLine)
			if (startLine !== undefined && endLine !== undefined) {
				content = addLineNumbers(await readLines(fullPath, endLine, startLine), startLine + 1)
				const lineRangeAttr = ` lines="${startLine + 1}-${endLine + 1}"`
				contentTag = `<content${lineRangeAttr}>\n${content}</content>\n`
				results.push(`<file><path>${relPath}</path>\n${contentTag}${xmlInfo}</file>`)
				continue
			}

			// Handle definitions-only mode
			if (maxReadFileLine === 0) {
				const defResult = await parseSourceCodeDefinitionsForFile(fullPath, cline.rooIgnoreController)
				if (defResult) {
					xmlInfo += `<list_code_definition_names>${defResult}</list_code_definition_names>\n`
				}
				results.push(`<file><path>${relPath}</path>\n${xmlInfo}</file>`)
				continue
			}

			// Handle files exceeding line threshold
			if (maxReadFileLine > 0 && totalLines > maxReadFileLine) {
				content = addLineNumbers(await readLines(fullPath, maxReadFileLine - 1, 0))
				const lineRangeAttr = ` lines="1-${maxReadFileLine}"`
				contentTag = `<content${lineRangeAttr}>\n${content}</content>\n`

				const defResult = await parseSourceCodeDefinitionsForFile(fullPath, cline.rooIgnoreController)
				if (defResult) {
					xmlInfo += `<list_code_definition_names>${defResult}</list_code_definition_names>\n`
				}
				xmlInfo += `<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n`
				results.push(`<file><path>${relPath}</path>\n${contentTag}${xmlInfo}</file>`)
				continue
			}

			// Handle normal file read
			content = await extractTextFromFile(fullPath)
			const lineRangeAttr = ` lines="1-${totalLines}"`
			contentTag = totalLines > 0 ? `<content${lineRangeAttr}>\n${content}</content>\n` : `<content/>`

			if (totalLines === 0) {
				xmlInfo += `<notice>File is empty</notice>\n`
			}

			// Track file read
			await cline.getFileContextTracker().trackFileContext(relPath, "read_tool" as RecordSource)

			// Add result
			results.push(`<file><path>${relPath}</path>\n${contentTag}${xmlInfo}</file>`)
		}

		// Push combined results
		pushToolResult(`<files>\n${results.join("\n")}\n</files>`)
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		pushToolResult(`<files><error>Error reading files: ${errorMsg}</error></files>`)
		await handleError("reading files", error)
	}
}
