import * as os from "os"
import * as path from "path"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import {
	getGlobalRooDirectory,
	getProjectRooDirectoryForCwd,
	directoryExists,
	fileExists,
	readFileIfExists,
	getRooDirectoriesForCwd,
	loadConfiguration,
} from "../index"

// Mock fs/promises module
const mockFs = {
	stat: vi.fn(),
	readFile: vi.fn(),
}

vi.mock("fs/promises", () => mockFs)

// Mock os module
const mockOs = {
	homedir: vi.fn(),
}

vi.mock("os", () => mockOs)

describe("RooConfigService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockOs.homedir.mockReturnValue("/mock/home")
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getGlobalRooDirectory", () => {
		it("should return correct path for global .roo directory", () => {
			const result = getGlobalRooDirectory()
			expect(result).toBe(path.join("/mock/home", ".roo"))
		})

		it("should handle different home directories", () => {
			mockOs.homedir.mockReturnValue("/different/home")
			const result = getGlobalRooDirectory()
			expect(result).toBe(path.join("/different/home", ".roo"))
		})
	})

	describe("getProjectRooDirectoryForCwd", () => {
		it("should return correct path for given cwd", () => {
			const cwd = "/custom/project/path"
			const result = getProjectRooDirectoryForCwd(cwd)
			expect(result).toBe(path.join(cwd, ".roo"))
		})
	})

	describe("directoryExists", () => {
		it("should return true for existing directory", async () => {
			mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any)

			const result = await directoryExists("/some/path")

			expect(result).toBe(true)
			expect(mockFs.stat).toHaveBeenCalledWith("/some/path")
		})

		it("should return false for non-existing path", async () => {
			mockFs.stat.mockRejectedValue(new Error("ENOENT"))

			const result = await directoryExists("/non/existing/path")

			expect(result).toBe(false)
		})

		it("should return false for files", async () => {
			mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any)

			const result = await directoryExists("/some/file.txt")

			expect(result).toBe(false)
		})
	})

	describe("fileExists", () => {
		it("should return true for existing file", async () => {
			mockFs.stat.mockResolvedValue({ isFile: () => true } as any)

			const result = await fileExists("/some/file.txt")

			expect(result).toBe(true)
			expect(mockFs.stat).toHaveBeenCalledWith("/some/file.txt")
		})

		it("should return false for non-existing file", async () => {
			mockFs.stat.mockRejectedValue(new Error("ENOENT"))

			const result = await fileExists("/non/existing/file.txt")

			expect(result).toBe(false)
		})

		it("should return false for directories", async () => {
			mockFs.stat.mockResolvedValue({ isFile: () => false } as any)

			const result = await fileExists("/some/directory")

			expect(result).toBe(false)
		})
	})

	describe("readFileIfExists", () => {
		it("should return file content for existing file", async () => {
			mockFs.readFile.mockResolvedValue("file content")

			const result = await readFileIfExists("/some/file.txt")

			expect(result).toBe("file content")
			expect(mockFs.readFile).toHaveBeenCalledWith("/some/file.txt", "utf-8")
		})

		it("should return null for non-existing file", async () => {
			mockFs.readFile.mockRejectedValue(new Error("ENOENT"))

			const result = await readFileIfExists("/non/existing/file.txt")

			expect(result).toBe(null)
		})
	})

	describe("getRooDirectoriesForCwd", () => {
		it("should return directories for given cwd", () => {
			const cwd = "/custom/project/path"

			const result = getRooDirectoriesForCwd(cwd)

			expect(result).toEqual([path.join("/mock/home", ".roo"), path.join(cwd, ".roo")])
		})
	})

	describe("loadConfiguration", () => {
		it("should load global configuration only when project does not exist", async () => {
			mockFs.readFile.mockResolvedValueOnce("global content").mockRejectedValueOnce(new Error("ENOENT"))

			const result = await loadConfiguration("rules/rules.md", "/project/path")

			expect(result).toEqual({
				global: "global content",
				project: null,
				merged: "global content",
			})
		})

		it("should load project configuration only when global does not exist", async () => {
			mockFs.readFile.mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValueOnce("project content")

			const result = await loadConfiguration("rules/rules.md", "/project/path")

			expect(result).toEqual({
				global: null,
				project: "project content",
				merged: "project content",
			})
		})

		it("should merge global and project configurations with project overriding global", async () => {
			mockFs.readFile.mockResolvedValueOnce("global content").mockResolvedValueOnce("project content")

			const result = await loadConfiguration("rules/rules.md", "/project/path")

			expect(result).toEqual({
				global: "global content",
				project: "project content",
				merged: "global content\n\n# Project-specific rules (override global):\n\nproject content",
			})
		})

		it("should return empty merged content when neither exists", async () => {
			mockFs.readFile.mockRejectedValueOnce(new Error("ENOENT")).mockRejectedValueOnce(new Error("ENOENT"))

			const result = await loadConfiguration("rules/rules.md", "/project/path")

			expect(result).toEqual({
				global: null,
				project: null,
				merged: "",
			})
		})

		it("should use correct file paths", async () => {
			mockFs.readFile.mockResolvedValue("content")

			await loadConfiguration("rules/rules.md", "/project/path")

			expect(mockFs.readFile).toHaveBeenCalledWith(path.join("/mock/home", ".roo", "rules/rules.md"), "utf-8")
			expect(mockFs.readFile).toHaveBeenCalledWith(path.join("/project/path", ".roo", "rules/rules.md"), "utf-8")
		})
	})
})
