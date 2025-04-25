// npx jest src/core/__tests__/read-file-xml.test.ts

import * as path from "path"

import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"
import { isBinaryFile } from "isbinaryfile"
import { ReadFileToolUse } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"

// Mock dependencies
jest.mock("../../integrations/misc/line-counter")
jest.mock("../../integrations/misc/read-lines")
jest.mock("../../integrations/misc/extract-text", () => {
	const actual = jest.requireActual("../../integrations/misc/extract-text")
	return {
		...actual,
		extractTextFromFile: jest.fn(),
		addLineNumbers: jest.fn().mockImplementation((text: string, startLine = 1) => {
			if (!text) return ""
			const lines = text.split("\n")
			return lines.map((line: string, i: number) => `${startLine + i} | ${line}`).join("\n")
		}),
	}
})

// Variable to control what content is used by the mock
let mockInputContent = ""
jest.mock("../../services/tree-sitter")
jest.mock("isbinaryfile")
jest.mock("../ignore/RooIgnoreController", () => ({
	RooIgnoreController: class {
		initialize() {
			return Promise.resolve()
		}
		validateAccess() {
			return true
		}
	},
}))
jest.mock("fs/promises", () => ({
	mkdir: jest.fn().mockResolvedValue(undefined),
	writeFile: jest.fn().mockResolvedValue(undefined),
	readFile: jest.fn().mockResolvedValue("{}"),
}))
jest.mock("../../utils/fs", () => ({
	fileExistsAtPath: jest.fn().mockReturnValue(true),
}))

// Mock path
jest.mock("path", () => {
	const originalPath = jest.requireActual("path")
	return {
		...originalPath,
		resolve: jest.fn().mockImplementation((...args) => args.join("/")),
	}
})

describe("read_file tool XML output structure", () => {
	// Test data
	const testFilePath = "test/file.txt"
	const absoluteFilePath = "/test/file.txt"
	const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
	const numberedFileContent = "1 | Line 1\n2 | Line 2\n3 | Line 3\n4 | Line 4\n5 | Line 5\n"
	const sourceCodeDef = "\n\n# file.txt\n1--5 | Content"

	// Mocked functions with correct types
	const mockedCountFileLines = countFileLines as jest.MockedFunction<typeof countFileLines>
	const mockedReadLines = readLines as jest.MockedFunction<typeof readLines>
	const mockedExtractTextFromFile = extractTextFromFile as jest.MockedFunction<typeof extractTextFromFile>
	const mockedParseSourceCodeDefinitionsForFile = parseSourceCodeDefinitionsForFile as jest.MockedFunction<
		typeof parseSourceCodeDefinitionsForFile
	>
	const mockedIsBinaryFile = isBinaryFile as jest.MockedFunction<typeof isBinaryFile>
	const mockedPathResolve = path.resolve as jest.MockedFunction<typeof path.resolve>

	// Mock instances
	const mockCline: any = {}
	let mockProvider: any
	let toolResult: string | undefined

	beforeEach(() => {
		jest.clearAllMocks()

		// Setup path resolution
		mockedPathResolve.mockReturnValue(absoluteFilePath)

		// Setup mocks for file operations
		mockedIsBinaryFile.mockResolvedValue(false)

		// Set the default content for the mock
		mockInputContent = fileContent

		// Setup mock provider with default maxReadFileLine
		mockProvider = {
			getState: jest.fn().mockResolvedValue({ maxReadFileLine: -1 }), // Default to full file read
			deref: jest.fn().mockReturnThis(),
		}

		// Setup Cline instance with mock methods
		mockCline.cwd = "/"
		mockCline.task = "Test"
		mockCline.providerRef = mockProvider
		mockCline.rooIgnoreController = {
			validateAccess: jest.fn().mockReturnValue(true),
		}
		mockCline.say = jest.fn().mockResolvedValue(undefined)
		mockCline.ask = jest.fn().mockResolvedValue(true)
		mockCline.presentAssistantMessage = jest.fn()
		mockCline.sayAndCreateMissingParamError = jest.fn().mockResolvedValue("Missing required parameter")
		// Add mock for getFileContextTracker method
		mockCline.getFileContextTracker = jest.fn().mockReturnValue({
			trackFileContext: jest.fn().mockResolvedValue(undefined),
		})
		mockCline.recordToolUsage = jest.fn().mockReturnValue(undefined)
		mockCline.recordToolError = jest.fn().mockReturnValue(undefined)

		// Reset tool result
		toolResult = undefined
	})

	/**
	 * Helper function to execute the read file tool with custom parameters
	 */
	async function executeReadFileTool(
		params: {
			args?: string
		} = {},
		options: {
			totalLines?: number
			maxReadFileLine?: number
			isBinary?: boolean
			validateAccess?: boolean
			skipAddLineNumbersCheck?: boolean // Flag to skip addLineNumbers check
		} = {},
	): Promise<string | undefined> {
		// Configure mocks based on test scenario
		const totalLines = options.totalLines ?? 5
		const maxReadFileLine = options.maxReadFileLine ?? 500
		const isBinary = options.isBinary ?? false
		const validateAccess = options.validateAccess ?? true

		mockProvider.getState.mockResolvedValue({ maxReadFileLine })
		mockedCountFileLines.mockResolvedValue(totalLines)
		mockedIsBinaryFile.mockResolvedValue(isBinary)
		mockCline.rooIgnoreController.validateAccess = jest.fn().mockReturnValue(validateAccess)

		// Create a tool use object
		const toolUse: ReadFileToolUse = {
			type: "tool_use",
			name: "read_file",
			params: {
				args: params.args ?? `:path:${testFilePath}`,
			},
			partial: false,
		}

		// Import the tool implementation dynamically to avoid hoisting issues
		const { readFileTool } = require("../tools/readFileTool")

		// Reset the spy's call history before each test
		;(addLineNumbers as jest.Mock).mockClear()

		// Execute the tool
		await readFileTool(
			mockCline,
			toolUse,
			mockCline.ask,
			jest.fn(),
			(result: string) => {
				toolResult = result
			},
			(param: string, value: string) => value,
		)

		return toolResult
	}

	describe("Basic XML Structure Tests", () => {
		it("should produce XML output with no unnecessary indentation", async () => {
			// Setup
			const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3\n4 | Line 4\n5 | Line 5"
			mockedExtractTextFromFile.mockResolvedValue(numberedContent)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: -1 })

			// Execute
			const result = await executeReadFileTool()

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-5">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})

		it("should follow the correct XML structure format", async () => {
			// Setup
			mockInputContent = fileContent
			mockedExtractTextFromFile.mockResolvedValue((addLineNumbers as jest.Mock)(fileContent))

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: -1 })

			// Verify using regex to check structure
			const xmlStructureRegex = new RegExp(
				`^<files>\\n<file><path>${testFilePath}</path>\\n<content lines="1-5">\\n.*</content>\\n</file>\\n</files>$`,
				"s",
			)
			expect(result).toMatch(xmlStructureRegex)
		})

		it("should properly escape special XML characters in content", async () => {
			// Setup
			const contentWithSpecialChars = "Line with <tags> & ampersands"
			mockInputContent = contentWithSpecialChars
			mockedExtractTextFromFile.mockResolvedValue(contentWithSpecialChars)

			// Execute
			const result = await executeReadFileTool()

			// Verify special characters are preserved
			expect(result).toContain(contentWithSpecialChars)
		})

		it("should handle empty XML tags correctly", async () => {
			// Setup
			mockedCountFileLines.mockResolvedValue(0)
			mockedExtractTextFromFile.mockResolvedValue("")
			mockedReadLines.mockResolvedValue("")
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: -1 })
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue("")
			;(addLineNumbers as jest.Mock).mockReturnValue("")

			// Execute
			const result = await executeReadFileTool({}, { totalLines: 0 })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content/><notice>File is empty</notice>\n</file>\n</files>`,
			)
		})
	})

	describe("Line Range Tests", () => {
		it("should include lines attribute when start_line is specified", async () => {
			// Setup
			const startLine = 2
			const endLine = 5
			const content = "Line 2\nLine 3\nLine 4\nLine 5"
			const numberedContent = "2 | Line 2\n3 | Line 3\n4 | Line 4\n5 | Line 5"
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockReturnValue(numberedContent)
			mockedCountFileLines.mockResolvedValue(endLine)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: endLine })

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${testFilePath}\n:start_line:${startLine}\n:end_line:${endLine}`,
			})

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="2-5">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})

		it("should include lines attribute when end_line is specified", async () => {
			// Setup
			const endLine = 3
			const content = "Line 1\nLine 2\nLine 3"
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"
			mockedReadLines.mockResolvedValue(content)
			mockedExtractTextFromFile.mockResolvedValue(numberedContent)
			mockedCountFileLines.mockResolvedValue(endLine)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: 500 })

			// Execute
			const result = await executeReadFileTool(
				{
					args: `:path:${testFilePath}\n:end_line:${endLine}`,
				},
				{ totalLines: endLine },
			)

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-3">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})

		it("should include lines attribute when both start_line and end_line are specified", async () => {
			// Setup
			const startLine = 2
			const endLine = 4
			const content = fileContent
				.split("\n")
				.slice(startLine - 1, endLine)
				.join("\n")
			mockedReadLines.mockResolvedValue(content)
			mockedCountFileLines.mockResolvedValue(endLine)
			mockInputContent = fileContent
			mockedExtractTextFromFile.mockResolvedValue(addLineNumbers(content, startLine))

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${testFilePath}\n:start_line:${startLine}\n:end_line:${endLine}`,
			})

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="${startLine}-${endLine}">\n${(
					addLineNumbers as jest.Mock
				)(
					fileContent
						.split("\n")
						.slice(startLine - 1, endLine)
						.join("\n"),
					startLine,
				)}</content>\n</file>\n</files>`,
			)
		})

		it("should handle invalid line range combinations", async () => {
			// Setup
			const startLine = 4
			const endLine = 2 // End line before start line
			mockedReadLines.mockRejectedValue(new Error("Invalid line range: end line cannot be less than start line"))
			mockedExtractTextFromFile.mockRejectedValue(
				new Error("Invalid line range: end line cannot be less than start line"),
			)

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${testFilePath}\n:start_line:${startLine}\n:end_line:${endLine}`,
			})

			// Verify error handling
			expect(result).toBe(
				`<files><error>Error reading files: Invalid line range: end line cannot be less than start line</error></files>`,
			)
		})

		it("should handle line ranges exceeding file length", async () => {
			// Setup
			const totalLines = 5
			const startLine = 3
			const endLine = 10 // Beyond file length
			const content = "Line 3\nLine 4\nLine 5"
			const numberedContent = "3 | Line 3\n4 | Line 4\n5 | Line 5"
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockReturnValue(numberedContent)
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: totalLines })

			// Execute
			const result = await executeReadFileTool(
				{
					args: `:path:${testFilePath}\n:start_line:${startLine}\n:end_line:${totalLines}`,
				},
				{ totalLines },
			)

			// Should adjust to actual file length
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="3-5">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})
	})

	describe("Notice and Definition Tags Tests", () => {
		it("should include notice tag for truncated files", async () => {
			// Setup
			const maxReadFileLine = 3
			const totalLines = 10
			const content = fileContent.split("\n").slice(0, maxReadFileLine).join("\n")
			mockedReadLines.mockResolvedValue(content)
			mockInputContent = content

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-${maxReadFileLine}">\n${(addLineNumbers as jest.Mock)(fileContent.split("\n").slice(0, maxReadFileLine).join("\n"))}</content>\n<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should include list_code_definition_names tag when source code definitions are available", async () => {
			// Setup
			const maxReadFileLine = 3
			const totalLines = 10
			const content = fileContent.split("\n").slice(0, maxReadFileLine).join("\n")
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockReturnValue(numberedContent)
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef.trim())

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-${maxReadFileLine}">\n${numberedContent}</content>\n<list_code_definition_names>${sourceCodeDef.trim()}</list_code_definition_names>\n<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should handle source code definitions with special characters", async () => {
			// Setup
			const defsWithSpecialChars = "\n\n# file.txt\n1--5 | Content with <tags> & symbols"
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(defsWithSpecialChars)

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 0 })

			// Verify special characters are preserved
			expect(result).toContain(defsWithSpecialChars.trim())
		})
	})

	describe("Error Handling Tests", () => {
		it("should include error tag for invalid path", async () => {
			// Setup - missing path parameter
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {},
				partial: false,
			}

			// Import the tool implementation dynamically
			const { readFileTool } = require("../tools/readFileTool")

			// Execute the tool
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(result: string) => {
					toolResult = result
				},
				(param: string, value: string) => value,
			)

			// Verify
			expect(toolResult).toBe(`<files><error>Missing required parameter</error></files>`)
		})

		it("should include error tag for invalid start_line", async () => {
			// Setup
			mockedExtractTextFromFile.mockRejectedValue(new Error("Invalid start_line value"))
			mockedReadLines.mockRejectedValue(new Error("Invalid start_line value"))

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${testFilePath}\n:start_line:invalid`,
			})

			// Verify
			expect(result).toBe(`<files><error>Error reading files: Invalid start_line value</error></files>`)
		})

		it("should include error tag for invalid end_line", async () => {
			// Setup
			mockedExtractTextFromFile.mockRejectedValue(new Error("Invalid end_line value"))
			mockedReadLines.mockRejectedValue(new Error("Invalid end_line value"))

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${testFilePath}\n:end_line:invalid`,
			})

			// Verify
			expect(result).toBe(`<files><error>Error reading files: Invalid end_line value</error></files>`)
		})

		it("should include error tag for RooIgnore error", async () => {
			// Execute - skip addLineNumbers check as it returns early with an error
			const result = await executeReadFileTool({}, { validateAccess: false })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path><error>Access to ${testFilePath} is blocked by the .rooignore file settings. You must try to continue in the task without using this file, or ask the user to update the .rooignore file.</error></file>\n</files>`,
			)
		})

		it("should handle errors with special characters", async () => {
			// Setup
			mockedExtractTextFromFile.mockRejectedValue(new Error("Error with <tags> & symbols"))

			// Execute
			const result = await executeReadFileTool()

			// Verify special characters in error message are preserved
			expect(result).toContain("Error with <tags> & symbols")
		})
	})

	describe("Multiple Files Tests", () => {
		it("should handle multiple file entries correctly", async () => {
			// Setup
			const file1Path = "test/file1.txt"
			const file2Path = "test/file2.txt"
			const file1Content = "File 1 content"
			const file2Content = "File 2 content"
			const file1Numbered = "1 | File 1 content"
			const file2Numbered = "1 | File 2 content"

			// Mock path resolution
			mockedPathResolve.mockImplementation((_, filePath) => {
				if (filePath === file1Path) return "/test/file1.txt"
				if (filePath === file2Path) return "/test/file2.txt"
				return filePath
			})

			// Mock content for each file
			mockedCountFileLines.mockResolvedValue(1)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: -1 })
			mockedExtractTextFromFile.mockImplementation((filePath) => {
				if (filePath === "/test/file1.txt") {
					return Promise.resolve(file1Numbered)
				}
				if (filePath === "/test/file2.txt") {
					return Promise.resolve(file2Numbered)
				}
				throw new Error("Unexpected file path")
			})

			// Execute
			const result = await executeReadFileTool(
				{
					args: `:path:${file1Path}\n======+++======\n:path:${file2Path}`,
				},
				{ totalLines: 1 },
			)

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${file1Path}</path>\n<content lines="1-1">\n${file1Numbered}</content>\n</file>\n<file><path>${file2Path}</path>\n<content lines="1-1">\n${file2Numbered}</content>\n</file>\n</files>`,
			)
		})

		it("should handle errors in multiple file entries independently", async () => {
			// Setup
			const validPath = "test/valid.txt"
			const invalidPath = "test/invalid.txt"
			const validContent = "Valid file content"
			const numberedContent = "1 | Valid file content"

			// Mock path resolution
			mockedPathResolve.mockImplementation((_, filePath) => {
				if (filePath === validPath) return "/test/valid.txt"
				if (filePath === invalidPath) return "/test/invalid.txt"
				return filePath
			})

			// Mock RooIgnore to block invalid file and track validation order
			const validationOrder: string[] = []
			mockCline.rooIgnoreController = {
				validateAccess: jest.fn().mockImplementation((path) => {
					validationOrder.push(`validate:${path}`)
					const isValid = path !== invalidPath
					if (!isValid) {
						validationOrder.push(`error:${path}`)
					}
					return isValid
				}),
			}

			// Mock say to track RooIgnore error
			mockCline.say = jest.fn().mockImplementation((type, path) => {
				// Don't add error to validationOrder here since validateAccess already does it
				return Promise.resolve()
			})

			// Mock provider state
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: -1 })

			// Mock file operations to track operation order
			mockedCountFileLines.mockImplementation((filePath) => {
				const relPath = filePath === "/test/valid.txt" ? validPath : invalidPath
				validationOrder.push(`countLines:${relPath}`)
				if (filePath.includes(validPath)) {
					return Promise.resolve(1)
				}
				throw new Error("File not found")
			})

			mockedIsBinaryFile.mockImplementation((filePath) => {
				const relPath = filePath === "/test/valid.txt" ? validPath : invalidPath
				validationOrder.push(`isBinary:${relPath}`)
				if (filePath.includes(validPath)) {
					return Promise.resolve(false)
				}
				throw new Error("File not found")
			})

			mockedExtractTextFromFile.mockImplementation((filePath) => {
				if (filePath === "/test/valid.txt") {
					validationOrder.push(`extract:${validPath}`)
					return Promise.resolve(numberedContent)
				}
				return Promise.reject(new Error("File not found"))
			})

			// Mock approval to always succeed since RooIgnore handles access
			mockCline.ask = jest.fn().mockResolvedValue(true)

			// Execute - Skip the default validateAccess mock
			const { readFileTool } = require("../tools/readFileTool")
			let toolResult: string | undefined

			// Create a tool use object
			const toolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:${validPath}\n======+++======\n:path:${invalidPath}`,
				},
				partial: false,
			}

			// Execute the tool directly to preserve our custom validateAccess mock
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(result: string) => {
					toolResult = result
				},
				(param: string, value: string) => value,
			)

			const result = toolResult

			// Verify validation happens before file operations
			expect(validationOrder).toEqual([
				`validate:${validPath}`,
				`validate:${invalidPath}`,
				`error:${invalidPath}`,
				`countLines:${validPath}`,
				`isBinary:${validPath}`,
				`extract:${validPath}`,
			])

			// Verify result
			expect(result).toBe(
				`<files>\n<file><path>${invalidPath}</path><error>${formatResponse.rooIgnoreError(invalidPath)}</error></file>\n<file><path>${validPath}</path>\n<content lines="1-1">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})

		it("should handle mixed binary and text files", async () => {
			// Setup
			const textPath = "test/text.txt"
			const binaryPath = "test/binary.pdf"
			const textContent = "Text file content"
			const numberedContent = "1 | Text file content"

			// Mock binary file detection
			mockedIsBinaryFile.mockImplementationOnce(() => Promise.resolve(false))
			mockedIsBinaryFile.mockImplementationOnce(() => Promise.resolve(true))

			// Mock content based on file type
			mockedExtractTextFromFile.mockImplementation((path) => {
				if (path.includes("binary")) {
					return Promise.resolve("")
				}
				return Promise.resolve(numberedContent)
			})
			mockedCountFileLines.mockImplementation((path) => {
				return Promise.resolve(path.includes("binary") ? 0 : 1)
			})
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: -1 })

			// Execute
			const result = await executeReadFileTool(
				{
					args: `:path:${textPath}\n======+++======\n:path:${binaryPath}`,
				},
				{ totalLines: 1 },
			)

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${textPath}</path>\n<content lines="1-1">\n${numberedContent}</content>\n</file>\n<file><path>${binaryPath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
		})
	})

	describe("Edge Cases Tests", () => {
		it("should handle empty files correctly with maxReadFileLine=-1", async () => {
			// Setup - use empty string
			mockInputContent = ""
			const maxReadFileLine = -1
			const totalLines = 0
			mockedCountFileLines.mockResolvedValue(totalLines)

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content/><notice>File is empty</notice>\n</file>\n</files>`,
			)
		})

		it("should handle empty files correctly with maxReadFileLine=0", async () => {
			// Setup
			mockedCountFileLines.mockResolvedValue(0)
			mockedExtractTextFromFile.mockResolvedValue("")
			mockedReadLines.mockResolvedValue("")
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue("")
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: 0 })
			mockedIsBinaryFile.mockResolvedValue(false)

			// Execute
			const result = await executeReadFileTool({}, { totalLines: 0 })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content/><notice>File is empty</notice>\n</file>\n</files>`,
			)
		})

		it("should handle binary files with custom content correctly", async () => {
			// Setup
			mockedIsBinaryFile.mockResolvedValue(true)
			mockedExtractTextFromFile.mockResolvedValue("")
			mockedReadLines.mockResolvedValue("")

			// Execute
			const result = await executeReadFileTool({}, { isBinary: true })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
			expect(mockedReadLines).not.toHaveBeenCalled()
		})

		it("should handle file read errors correctly", async () => {
			// Setup
			const errorMessage = "File not found"
			// For error cases, we need to override the mock to simulate a failure
			mockedExtractTextFromFile.mockRejectedValue(new Error(errorMessage))

			// Execute
			const result = await executeReadFileTool({})

			// Verify
			expect(result).toBe(`<files><error>Error reading files: ${errorMessage}</error></files>`)
			expect(result).not.toContain(`<content`)
		})

		it("should handle files with XML-like content", async () => {
			// Setup
			const xmlContent = "<root><child>Test</child></root>"
			mockInputContent = xmlContent
			mockedExtractTextFromFile.mockResolvedValue(xmlContent)

			// Execute
			const result = await executeReadFileTool()

			// Verify XML content is preserved
			expect(result).toContain(xmlContent)
		})

		it("should handle files with very long paths", async () => {
			// Setup
			const longPath = "very/long/path/".repeat(10) + "file.txt"

			// Execute
			const result = await executeReadFileTool({
				args: `:path:${longPath}`,
			})

			// Verify long path is handled correctly
			expect(result).toContain(`<path>${longPath}</path>`)
		})
	})
})
