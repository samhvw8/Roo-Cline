// npx jest src/core/__tests__/read-file-tool.test.ts

import * as path from "path"
import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { extractTextFromFile, addLineNumbers } from "../../integrations/misc/extract-text"
import { parseSourceCodeDefinitionsForFile } from "../../services/tree-sitter"
import { isBinaryFile } from "isbinaryfile"
import { ReadFileToolUse } from "../../shared/tools"

// Mock dependencies
jest.mock("../../integrations/misc/line-counter")
jest.mock("../../integrations/misc/read-lines")
jest.mock("../../integrations/misc/extract-text")
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

describe("read_file tool functionality", () => {
	// Mock instances
	const mockCline = {
		cwd: "/test",
		task: "Test",
		providerRef: {
			getState: jest.fn().mockResolvedValue({ maxReadFileLine: 500 }),
			deref: jest.fn().mockReturnThis(),
		},
		rooIgnoreController: {
			validateAccess: jest.fn().mockReturnValue(true),
		},
		say: jest.fn().mockResolvedValue(undefined),
		ask: jest.fn().mockResolvedValue(true),
		presentAssistantMessage: jest.fn(),
		getFileContextTracker: jest.fn().mockReturnValue({
			trackFileContext: jest.fn().mockResolvedValue(undefined),
		}),
		recordToolUsage: jest.fn(),
		recordToolError: jest.fn(),
		sayAndCreateMissingParamError: jest.fn().mockResolvedValue("Missing required parameter"),
		consecutiveMistakeCount: 0,
	}

	beforeEach(() => {
		jest.clearAllMocks()
		mockCline.consecutiveMistakeCount = 0
		;(extractTextFromFile as jest.Mock).mockImplementation(() => Promise.resolve("Test content"))
		;(readLines as jest.Mock).mockImplementation(() => Promise.resolve("Test content"))
		;(addLineNumbers as jest.Mock).mockImplementation((text, startLine = 1) => {
			return text
				.split("\n")
				.map((line: string, i: number) => `${startLine + i} | ${line}`)
				.join("\n")
		})
		;(isBinaryFile as jest.Mock).mockResolvedValue(false)
		;(parseSourceCodeDefinitionsForFile as jest.Mock).mockResolvedValue("")
	})

	describe("Args Parameter Format", () => {
		it("should handle single file read with line range", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:src/app.ts\n:start_line:1\n:end_line:100`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockResolvedValue(200)
			;(readLines as jest.Mock).mockResolvedValue("Test content")
			;(addLineNumbers as jest.Mock).mockReturnValue("1 | Test content")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>src/app.ts</path>\n<content lines="1-100">\n1 | Test content</content>\n</file>\n</files>`,
			)
		})

		it("should handle multiple file reads", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:src/app.ts\n:start_line:1\n:end_line:50\n======+++======\n:path:src/utils.ts`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			// Mock for first file with range
			;(readLines as jest.Mock).mockImplementationOnce(() => Promise.resolve("Test content"))
			;(addLineNumbers as jest.Mock).mockImplementationOnce(() => "1 | Test content")

			// Mock for second file
			;(countFileLines as jest.Mock).mockResolvedValue(100)
			;(extractTextFromFile as jest.Mock).mockResolvedValue("1 | Test content")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>src/app.ts</path>\n<content lines="1-50">\n1 | Test content</content>\n</file>\n<file><path>src/utils.ts</path>\n<content lines="1-100">\n1 | Test content</content>\n</file>\n</files>`,
			)
		})

		it("should handle invalid line range parameters", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:src/app.ts\n:start_line:abc\n:end_line:def`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(`<files><error>Error reading files: Invalid start_line value</error></files>`)
		})

		it("should handle empty file entries in multiple file reads", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:src/app.ts\n======+++======\n\n======+++======\n:path:src/utils.ts`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toContain("<file><path>src/app.ts</path>")
			expect(result).toContain("<file><path>src/utils.ts</path>")
			expect(result).not.toContain("<error>")
		})
	})

	describe("File Content Reading", () => {
		it("should read entire file when line count is less than maxReadFileLine", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:smallFile.txt`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockResolvedValue(100)
			;(extractTextFromFile as jest.Mock).mockResolvedValue("1 | Test content")
			;(addLineNumbers as jest.Mock).mockReturnValue("1 | Small file content")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>smallFile.txt</path>\n<content lines="1-100">\n1 | Test content</content>\n</file>\n</files>`,
			)
		})

		it("should truncate file when line count exceeds maxReadFileLine", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:largeFile.txt`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockResolvedValue(5000)
			;(readLines as jest.Mock).mockResolvedValue("Test content")
			;(addLineNumbers as jest.Mock).mockReturnValue("1 | Test content")
			;(parseSourceCodeDefinitionsForFile as jest.Mock).mockResolvedValue("")
			mockCline.providerRef.getState.mockResolvedValue({ maxReadFileLine: 500 })

			// Reset mocks to ensure clean state
			;(extractTextFromFile as jest.Mock).mockReset()
			;(readLines as jest.Mock).mockReset().mockResolvedValue("Test content")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>largeFile.txt</path>\n<content lines="1-500">\n1 | Test content</content>\n<notice>Showing only 500 of 5000 total lines. Use start_line and end_line if you need to read more</notice>\n</file>\n</files>`,
			)
		})

		it("should handle binary files correctly", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:binary.pdf`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(isBinaryFile as jest.Mock).mockResolvedValue(true)
			;(extractTextFromFile as jest.Mock).mockResolvedValue("PDF content")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>binary.pdf</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
		})

		it("should handle large binary files with line ranges", async () => {
			const filePath = "large.pdf"
			const fullPath = path.resolve(mockCline.cwd, filePath)

			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:${filePath}\n:start_line:1\n:end_line:100`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(isBinaryFile as jest.Mock).mockResolvedValue(true)
			;(extractTextFromFile as jest.Mock).mockResolvedValue("PDF content")
			;(countFileLines as jest.Mock).mockResolvedValue(1000)

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>${filePath}</path>\n<notice>Binary file</notice>\n</file>\n</files>`,
			)
			expect(extractTextFromFile).not.toHaveBeenCalled()
			expect(readLines).not.toHaveBeenCalled()
			expect(isBinaryFile).toHaveBeenCalledWith(fullPath)
		})
	})

	describe("Error Handling", () => {
		it("should handle missing path parameter", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: "",
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toContain("<error>")
			expect(mockCline.recordToolError).toHaveBeenCalled()
		})

		it("should handle file read errors", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:nonexistent.txt`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockRejectedValue(new Error("File not found"))

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(`<files><error>Error reading files: File not found</error></files>`)
		})

		it("should handle line counting errors", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:error.txt`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockRejectedValue(new Error("Line counting failed"))

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>error.txt</path><error>Error reading file: Line counting failed</error></file>\n</files>`,
			)
		})

		it("should handle errors in source code definition parsing", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:src/code.ts`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(parseSourceCodeDefinitionsForFile as jest.Mock).mockRejectedValue(new Error("Parser error"))
			;(countFileLines as jest.Mock).mockResolvedValue(1000)

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toBe(
				`<files>\n<file><path>src/code.ts</path><error>Error reading file: Parser error</error></file>\n</files>`,
			)
		})
	})

	describe("Performance Edge Cases", () => {
		it("should handle very large files efficiently", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:huge.log`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			;(countFileLines as jest.Mock).mockResolvedValue(1000000)
			;(readLines as jest.Mock).mockResolvedValue("First 500 lines")

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toContain("<notice>Showing only 500 of 1000000 total lines")
			expect(extractTextFromFile).not.toHaveBeenCalled()
			expect(readLines).toHaveBeenCalled()
		})

		it("should handle files with very long lines", async () => {
			const toolUse: ReadFileToolUse = {
				type: "tool_use",
				name: "read_file",
				params: {
					args: `:path:longlines.txt`,
				},
				partial: false,
			}

			const { readFileTool } = require("../tools/readFileTool")

			const longLine = "x".repeat(10000)
			;(countFileLines as jest.Mock).mockResolvedValue(10)
			;(extractTextFromFile as jest.Mock).mockResolvedValue(longLine)
			;(addLineNumbers as jest.Mock).mockImplementation((text) => `1 | ${text}`)

			let result: string | undefined
			await readFileTool(
				mockCline,
				toolUse,
				mockCline.ask,
				jest.fn(),
				(r: string) => {
					result = r
				},
				(param: string, value: string) => value,
			)

			expect(result).toContain(longLine)
			expect(result).toContain('lines="1-10"')
		})
	})
})
