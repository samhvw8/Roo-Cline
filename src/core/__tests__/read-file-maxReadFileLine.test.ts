// npx jest src/core/__tests__/read-file-maxReadFileLine.test.ts

import * as path from "path"

import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"
import { isBinaryFile } from "isbinaryfile"
import { ReadFileToolUse } from "../../shared/tools"
import { ToolUsage } from "../../schemas"

// Mock dependencies
jest.mock("../../integrations/misc/line-counter")
jest.mock("../../integrations/misc/read-lines")
jest.mock("../../integrations/misc/extract-text", () => {
	const actual = jest.requireActual("../../integrations/misc/extract-text")
	return {
		...actual,
		extractTextFromFile: jest.fn(),
		addLineNumbers: jest.fn().mockImplementation((text: string, startLine = 1) => {
			return text
				.split("\n")
				.map((line: string, i: number) => `${startLine + i} | ${line}`)
				.join("\n")
		}),
	}
})

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

describe("read_file tool with maxReadFileLine setting", () => {
	// Test data
	const testFilePath = "test/file.txt"
	const absoluteFilePath = "/test/file.txt" // Keep leading slash to match implementation
	const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5"
	const numberedFileContent = "1 | Line 1\n2 | Line 2\n3 | Line 3\n4 | Line 4\n5 | Line 5"
	const sourceCodeDef = "# file.txt\n1--5 | Content"
	const expectedFullFileXml =
		`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-5">\n${numberedFileContent}\n</content>\n</file>\n</files>`.trim()

	// Mocked functions with correct types
	const mockedCountFileLines = countFileLines as jest.MockedFunction<typeof countFileLines>
	const mockedReadLines = readLines as jest.MockedFunction<typeof readLines>
	const mockedExtractTextFromFile = extractTextFromFile as jest.MockedFunction<typeof extractTextFromFile>
	const mockedParseSourceCodeDefinitionsForFile = parseSourceCodeDefinitionsForFile as jest.MockedFunction<
		typeof parseSourceCodeDefinitionsForFile
	>

	// Variable to control what content is used by the mock - set in beforeEach
	let mockInputContent = ""

	const mockedIsBinaryFile = isBinaryFile as jest.MockedFunction<typeof isBinaryFile>
	const mockedPathResolve = path.resolve as jest.MockedFunction<typeof path.resolve>

	// Mock instances
	const mockCline: any = {}
	let mockProvider: any
	let toolResult: string | undefined

	beforeEach(() => {
		jest.clearAllMocks()

		// Setup path resolution to match implementation
		mockedPathResolve.mockReturnValue(absoluteFilePath)

		// Setup mocks for file operations
		mockedIsBinaryFile.mockResolvedValue(false)

		// Set the default content for the mock
		mockInputContent = fileContent

		// Setup mocks
		// Setup mocks with proper line numbering and line endings
		mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedFileContent + "\n"))
		mockedReadLines.mockImplementation(() => Promise.resolve(fileContent))
		;(addLineNumbers as jest.Mock).mockImplementation((text: string, startLine = 1) => {
			if (!text) return ""
			const lines = text.split("\n")
			return lines.map((line: string, i: number) => `${startLine + i} | ${line}`).join("\n") + "\n"
		})

		// Setup mock provider with default maxReadFileLine
		mockProvider = {
			getState: jest.fn().mockResolvedValue({ maxReadFileLine: 500 }),
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
		mockCline.getFileContextTracker = jest.fn().mockReturnValue({
			trackFileContext: jest.fn().mockResolvedValue(undefined),
		})
		mockCline.recordToolUsage = jest.fn().mockReturnValue(undefined)
		mockCline.recordToolError = jest.fn().mockReturnValue(undefined)
		// Reset tool result
		toolResult = undefined
	})

	/**
	 * Helper function to execute the read file tool with different maxReadFileLine settings
	 */
	async function executeReadFileTool(
		params: {
			path?: string
			start_line?: string
			end_line?: string
		} = {},
		options: {
			maxReadFileLine?: number
			totalLines?: number
			skipAddLineNumbersCheck?: boolean // Flag to skip addLineNumbers check
		} = {},
	): Promise<string | undefined> {
		// Configure mocks based on test scenario
		const maxReadFileLine = options.maxReadFileLine ?? 500
		const totalLines = options.totalLines ?? 5

		mockProvider.getState.mockResolvedValue({ maxReadFileLine })
		mockedCountFileLines.mockResolvedValue(totalLines)

		// Reset the spy before each test
		;(addLineNumbers as jest.Mock).mockClear()

		// Format args string based on params
		let argsContent = `:path:${params.path || testFilePath}`
		if (params.start_line) {
			argsContent += `\n:start_line:${params.start_line}`
		}
		if (params.end_line) {
			argsContent += `\n:end_line:${params.end_line}`
		}

		const toolUse: ReadFileToolUse = {
			type: "tool_use",
			name: "read_file",
			params: {
				args: argsContent,
			},
			partial: false,
		}

		// Import the tool implementation dynamically to avoid hoisting issues
		const { readFileTool } = require("../tools/readFileTool")

		// Execute the tool
		await readFileTool(
			mockCline,
			toolUse,
			mockCline.ask,
			jest.fn(),
			(r: string) => {
				toolResult = r
			},
			(param: string, value: string) => value,
		)

		return toolResult
	}

	describe("when maxReadFileLine is negative", () => {
		it("should read the entire file using extractTextFromFile", async () => {
			// Setup - use default mockInputContent with line numbers
			mockInputContent = fileContent
			mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedFileContent + "\n"))
			mockedExtractTextFromFile.mockClear() // Clear mock history
			mockedExtractTextFromFile.mockImplementationOnce(() => Promise.resolve(numberedFileContent + "\n"))
			mockedExtractTextFromFile.mockImplementationOnce(() => Promise.resolve(numberedFileContent + "\n"))

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: -1 })

			// Verify
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(mockedParseSourceCodeDefinitionsForFile).not.toHaveBeenCalled()
			expect(result).toBe(expectedFullFileXml)
		})

		it("should ignore range parameters and read entire file when maxReadFileLine is -1", async () => {
			// Setup - use default mockInputContent with line numbers
			mockInputContent = fileContent
			mockedPathResolve.mockReturnValue(absoluteFilePath)
			mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedFileContent))
			mockedCountFileLines.mockResolvedValue(5)

			// Execute with range parameters
			const result = await executeReadFileTool(
				{
					start_line: "2",
					end_line: "4",
				},
				{ maxReadFileLine: -1 },
			)

			// Verify that readLines is used for range reads regardless of maxReadFileLine
			expect(mockedReadLines).toHaveBeenCalledWith(absoluteFilePath, 3, 1) // end_line - 1, start_line - 1
			expect(mockedExtractTextFromFile).not.toHaveBeenCalled()
			expect(mockedParseSourceCodeDefinitionsForFile).not.toHaveBeenCalled()
			expect(result).toContain(`<content lines="2-4">`)
		})

		it("should not show line snippet in approval message when maxReadFileLine is -1", async () => {
			// Setup - use default mockInputContent
			mockInputContent = fileContent

			// Execute
			await executeReadFileTool({}, { maxReadFileLine: -1 })

			// Verify the empty line snippet for full read was passed to the approval message
			const askCall = mockCline.ask.mock.calls[0]
			const completeMessage = JSON.parse(askCall[1])

			// Verify the reason (lineSnippet) is empty or undefined for full read
			expect(completeMessage.reason).toBeFalsy()
		})

		it("should handle negative values other than -1", async () => {
			// Setup with line numbers
			mockInputContent = fileContent
			mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedFileContent + "\n"))

			// Execute with -2
			const result = await executeReadFileTool({}, { maxReadFileLine: -2 })

			// Should behave same as -1
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(result).toBe(expectedFullFileXml)
		})
	})

	describe("when maxReadFileLine is 0", () => {
		it("should return an empty content with source code definitions", async () => {
			// Setup - for maxReadFileLine = 0, the implementation won't call readLines
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef)

			// Execute - skip addLineNumbers check as it's not called for maxReadFileLine=0
			const result = await executeReadFileTool(
				{},
				{
					maxReadFileLine: 0,
					totalLines: 5,
					skipAddLineNumbersCheck: true,
				},
			)

			// Verify
			expect(mockedExtractTextFromFile).not.toHaveBeenCalled()
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(mockedParseSourceCodeDefinitionsForFile).toHaveBeenCalledWith(
				absoluteFilePath,
				mockCline.rooIgnoreController,
			)

			// Verify XML structure
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<list_code_definition_names>${sourceCodeDef}</list_code_definition_names>\n</file>\n</files>`,
			)
		})

		it("should handle binary files with maxReadFileLine=0", async () => {
			// Setup
			mockedIsBinaryFile.mockResolvedValue(true)
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue("")

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 0 })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
			expect(mockedExtractTextFromFile).not.toHaveBeenCalled()
			expect(mockedReadLines).not.toHaveBeenCalled()
		})
	})

	describe("when maxReadFileLine is less than file length", () => {
		it("should read only maxReadFileLine lines and add source code definitions", async () => {
			// Setup
			const content = "Line 1\nLine 2\nLine 3"
			mockedReadLines.mockResolvedValue(content)
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef.trim())
			;(addLineNumbers as jest.Mock).mockImplementation((text: string, startLine = 1) => {
				return text
					.split("\n")
					.map((line: string, i: number) => `${startLine + i} | ${line}`)
					.join("\n")
			})

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 3 })

			// Verify
			expect(mockedExtractTextFromFile).not.toHaveBeenCalled()
			expect(mockedReadLines).toHaveBeenCalled()
			expect(mockedParseSourceCodeDefinitionsForFile).toHaveBeenCalledWith(
				absoluteFilePath,
				mockCline.rooIgnoreController,
			)

			// Verify XML structure
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-3">\n1 | Line 1\n2 | Line 2\n3 | Line 3</content>\n<list_code_definition_names>${sourceCodeDef.trim()}</list_code_definition_names>\n<notice>Showing only 3 of 5 total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should handle invalid maxReadFileLine values", async () => {
			// Setup
			const content = "Line 1\nLine 2\nLine 3"
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockImplementation(() => numberedContent)
			mockProvider.getState.mockResolvedValue({ maxReadFileLine: 3 })
			mockedCountFileLines.mockResolvedValue(3)
			mockedPathResolve.mockReturnValue(absoluteFilePath)
			mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedContent))
			mockedExtractTextFromFile.mockImplementation(() => Promise.resolve(numberedContent))

			// Execute with NaN
			const result = await executeReadFileTool({}, { maxReadFileLine: NaN })

			// Should use full file content when maxReadFileLine is invalid
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-5">\n${numberedContent}</content>\n</file>\n</files>`,
			)
			expect(mockedExtractTextFromFile).toHaveBeenCalled()
		})
	})

	describe("maxReadFileLine boundary cases", () => {
		it("should handle maxReadFileLine exactly equal to file length", async () => {
			// Setup
			const totalLines = 5
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockInputContent = fileContent

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: totalLines, totalLines })

			// Verify
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(result).toBe(expectedFullFileXml)
		})

		it("should handle maxReadFileLine one less than file length", async () => {
			// Setup
			const totalLines = 5
			const maxReadFileLine = totalLines - 1
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockedReadLines.mockResolvedValue(fileContent.split("\n").slice(0, maxReadFileLine).join("\n"))
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef)

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Verify
			expect(mockedReadLines).toHaveBeenCalled()
			expect(result).toContain(`<content lines="1-${maxReadFileLine}">`)
			expect(result).toContain("<list_code_definition_names>")
			expect(result).toContain(`<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines`)
		})

		it("should handle maxReadFileLine one more than file length", async () => {
			// Setup
			const totalLines = 5
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockInputContent = fileContent

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: totalLines + 1, totalLines })

			// Verify
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(result).toBe(expectedFullFileXml)
		})

		it("should handle very large maxReadFileLine values", async () => {
			// Setup
			const totalLines = 5
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockInputContent = fileContent

			// Execute with Number.MAX_SAFE_INTEGER
			const result = await executeReadFileTool({}, { maxReadFileLine: Number.MAX_SAFE_INTEGER, totalLines })

			// Should behave like any value > totalLines
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(result).toBe(expectedFullFileXml)
		})
	})

	describe("source code definitions interaction", () => {
		it("should include definitions for truncated source code files", async () => {
			// Setup
			const maxReadFileLine = 3
			const totalLines = 10
			const truncatedContent = fileContent.split("\n").slice(0, maxReadFileLine).join("\n")
			mockedReadLines.mockResolvedValue(truncatedContent)
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef.trim())
			;(addLineNumbers as jest.Mock).mockImplementation((text: string, startLine = 1) => {
				return text
					.split("\n")
					.map((line: string, i: number) => `${startLine + i} | ${line}`)
					.join("\n")
			})

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-${maxReadFileLine}">\n1 | Line 1\n2 | Line 2\n3 | Line 3</content>\n<list_code_definition_names>${sourceCodeDef.trim()}</list_code_definition_names>\n<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should not include definitions for non-truncated files", async () => {
			// Setup
			const totalLines = 5
			mockedCountFileLines.mockResolvedValue(totalLines)
			mockInputContent = fileContent
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue(sourceCodeDef)

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: totalLines + 1, totalLines })

			// Verify
			expect(result).toBe(expectedFullFileXml)
			expect(result).not.toContain("<list_code_definition_names>")
		})

		it("should handle errors in source code definition parsing", async () => {
			// Setup
			const maxReadFileLine = 3
			const totalLines = 10
			const truncatedContent = fileContent.split("\n").slice(0, maxReadFileLine).join("\n")
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"
			mockedReadLines.mockResolvedValue(truncatedContent)
			mockedParseSourceCodeDefinitionsForFile.mockRejectedValue(new Error("Parser error"))
			mockedExtractTextFromFile.mockRejectedValue(new Error("Parser error"))

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Should return per-file error message
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path><error>Error reading file: Parser error</error></file>\n</files>`,
			)
		})
	})

	describe("when maxReadFileLine equals or exceeds file length", () => {
		it("should use extractTextFromFile when maxReadFileLine > totalLines", async () => {
			// Setup
			mockedCountFileLines.mockResolvedValue(5) // File shorter than maxReadFileLine
			mockInputContent = fileContent

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 10, totalLines: 5 })

			// Verify
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(result).toBe(expectedFullFileXml)
		})

		it("should read with extractTextFromFile when file has few lines", async () => {
			// Setup
			mockedCountFileLines.mockResolvedValue(3) // File shorter than maxReadFileLine
			mockInputContent = fileContent.split("\n").slice(0, 3).join("\n")
			const numberedContent = "1 | Line 1\n2 | Line 2\n3 | Line 3"
			mockedExtractTextFromFile.mockResolvedValue(numberedContent)

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 5, totalLines: 3 })

			// Verify
			expect(mockedExtractTextFromFile).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockedReadLines).not.toHaveBeenCalled()
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-3">\n${numberedContent}</content>\n</file>\n</files>`,
			)
		})
	})

	describe("when file is binary", () => {
		it("should always use extractTextFromFile regardless of maxReadFileLine", async () => {
			// Setup
			mockedIsBinaryFile.mockResolvedValue(true)
			mockedCountFileLines.mockResolvedValue(3)
			mockedExtractTextFromFile.mockResolvedValue("")

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine: 3 })

			// Verify
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
			expect(mockedReadLines).not.toHaveBeenCalled()
		})

		it("should handle binary files with line ranges correctly", async () => {
			// Setup
			mockedIsBinaryFile.mockResolvedValue(true)
			mockedCountFileLines.mockResolvedValue(10)

			// Execute with range parameters
			const result = await executeReadFileTool(
				{
					start_line: "2",
					end_line: "5",
				},
				{ maxReadFileLine: 3 },
			)

			// Binary files should ignore ranges
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
			expect(mockedReadLines).not.toHaveBeenCalled()
		})
	})

	describe("with range parameters", () => {
		it("should honor start_line and end_line when provided", async () => {
			// Setup
			const content = "Line 2\nLine 3\nLine 4"
			const numberedContent = "2 | Line 2\n3 | Line 3\n4 | Line 4"
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockImplementation((text: string, startLine = 1) => {
				const lines = text.split("\n")
				return lines.map((line: string, i: number) => `${startLine + i} | ${line}`).join("\n")
			})

			// Execute using executeReadFileTool with range parameters
			const rangeResult = await executeReadFileTool({
				start_line: "2",
				end_line: "4",
			})

			// Verify
			expect(mockedReadLines).toHaveBeenCalledWith(absoluteFilePath, 3, 1) // end_line - 1, start_line - 1
			expect(addLineNumbers).toHaveBeenCalledWith(expect.any(String), 2) // start with proper line numbers

			// Verify XML structure with lines attribute
			expect(rangeResult).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="2-4">\n2 | Line 2\n3 | Line 3\n4 | Line 4</content>\n</file>\n</files>`,
			)
		})

		it("should handle overlapping maxReadFileLine and range parameters", async () => {
			// Setup
			const maxReadFileLine = 2
			const totalLines = 10
			mockedReadLines.mockResolvedValue("Line 4\nLine 5")

			// Execute with range larger than maxReadFileLine
			const result = await executeReadFileTool(
				{
					start_line: "4",
					end_line: "8",
				},
				{ maxReadFileLine, totalLines },
			)

			// Range parameters should take precedence
			expect(result).toContain('lines="4-8"')
			expect(mockedReadLines).toHaveBeenCalled()
		})
	})

	describe("performance considerations", () => {
		it("should handle very large files efficiently", async () => {
			// Setup
			const totalLines = 1000000
			const maxReadFileLine = 500
			mockedCountFileLines.mockResolvedValue(totalLines)
			const content = "First 500 lines"
			const numberedContent = "1 | " + content
			mockedReadLines.mockResolvedValue(content)
			;(addLineNumbers as jest.Mock).mockImplementation((text: string) => {
				return "1 | " + text + "\n"
			})
			mockProvider.getState.mockResolvedValue({ maxReadFileLine })
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue("")

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine, totalLines })

			// Should use readLines for efficiency
			expect(mockedReadLines).toHaveBeenCalled()
			expect(mockedExtractTextFromFile).not.toHaveBeenCalled()
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-${maxReadFileLine}">\n${numberedContent}\n</content>\n<notice>Showing only ${maxReadFileLine} of ${totalLines} total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should handle files with very long lines", async () => {
			// Setup
			const longLine = "x".repeat(10000)
			const maxReadFileLine = 3
			const numberedLine = "1 | " + longLine
			mockedReadLines.mockResolvedValue(longLine)
			mockedCountFileLines.mockResolvedValue(5)
			;(addLineNumbers as jest.Mock).mockImplementation((text: string) => {
				return "1 | " + text + "\n"
			})
			mockProvider.getState.mockResolvedValue({ maxReadFileLine })
			mockedParseSourceCodeDefinitionsForFile.mockResolvedValue("")

			// Execute
			const result = await executeReadFileTool({}, { maxReadFileLine })

			// Should handle long lines without issues
			expect(result).toBe(
				`<files>\n<file><path>${testFilePath}</path>\n<content lines="1-${maxReadFileLine}">\n${numberedLine}\n</content>\n<notice>Showing only ${maxReadFileLine} of 5 total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})
	})
})
