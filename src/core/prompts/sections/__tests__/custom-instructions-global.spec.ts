import * as os from "os"
import * as path from "path"
import { promises as fs } from "fs"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { loadRuleFiles, addCustomInstructions } from "../custom-instructions"

// Mock os module
vi.mock("os")
const mockOs = vi.mocked(os)

// Mock fs/promises
vi.mock("fs/promises")
const mockFs = vi.mocked(fs)

// Mock the roo-config service
vi.mock("../../../../services/roo-config", () => ({
	getRooDirectoriesForCwd: vi.fn(),
}))

import { getRooDirectoriesForCwd } from "../../../../services/roo-config"
const mockGetRooDirectoriesForCwd = vi.mocked(getRooDirectoriesForCwd)

describe("custom-instructions global .roo support", () => {
	const mockCwd = "/mock/project"
	const mockHomeDir = "/mock/home"
	const globalRooDir = path.join(mockHomeDir, ".roo")
	const projectRooDir = path.join(mockCwd, ".roo")

	beforeEach(() => {
		vi.clearAllMocks()
		mockOs.homedir.mockReturnValue(mockHomeDir)
		mockGetRooDirectoriesForCwd.mockReturnValue([globalRooDir, projectRooDir])
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("loadRuleFiles", () => {
		it("should load global rules only when project rules do not exist", async () => {
			// Mock directory existence
			mockFs.stat
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // global rules dir exists
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules dir doesn't exist

			// Mock directory reading for global rules
			mockFs.readdir.mockResolvedValueOnce([
				{ name: "rules.md", isFile: () => true, isSymbolicLink: () => false } as any,
			])

			// Mock file reading
			mockFs.stat.mockResolvedValueOnce({ isFile: () => true } as any) // for the file check
			mockFs.readFile.mockResolvedValueOnce("global rule content")

			const result = await loadRuleFiles(mockCwd)

			expect(result).toContain("# Global rules:")
			expect(result).toContain("global rule content")
			expect(result).not.toContain("# Project-specific rules:")
		})

		it("should load project rules only when global rules do not exist", async () => {
			// Mock directory existence
			mockFs.stat
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules dir doesn't exist
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // project rules dir exists

			// Mock directory reading for project rules
			mockFs.readdir.mockResolvedValueOnce([
				{ name: "rules.md", isFile: () => true, isSymbolicLink: () => false } as any,
			])

			// Mock file reading
			mockFs.stat.mockResolvedValueOnce({ isFile: () => true } as any) // for the file check
			mockFs.readFile.mockResolvedValueOnce("project rule content")

			const result = await loadRuleFiles(mockCwd)

			expect(result).toContain("# Project-specific rules:")
			expect(result).toContain("project rule content")
			expect(result).not.toContain("# Global rules:")
		})

		it("should merge global and project rules with project rules after global", async () => {
			// Mock directory existence - both exist
			mockFs.stat
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // global rules dir exists
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // project rules dir exists

			// Mock directory reading
			mockFs.readdir
				.mockResolvedValueOnce([{ name: "global.md", isFile: () => true, isSymbolicLink: () => false } as any])
				.mockResolvedValueOnce([{ name: "project.md", isFile: () => true, isSymbolicLink: () => false } as any])

			// Mock file reading
			mockFs.stat
				.mockResolvedValueOnce({ isFile: () => true } as any) // global file check
				.mockResolvedValueOnce({ isFile: () => true } as any) // project file check

			mockFs.readFile.mockResolvedValueOnce("global rule content").mockResolvedValueOnce("project rule content")

			const result = await loadRuleFiles(mockCwd)

			expect(result).toContain("# Global rules:")
			expect(result).toContain("global rule content")
			expect(result).toContain("# Project-specific rules:")
			expect(result).toContain("project rule content")

			// Ensure project rules come after global rules
			const globalIndex = result.indexOf("# Global rules:")
			const projectIndex = result.indexOf("# Project-specific rules:")
			expect(globalIndex).toBeLessThan(projectIndex)
		})

		it("should fall back to legacy .roorules file when no .roo/rules directories exist", async () => {
			// Mock directory existence - neither exist
			mockFs.stat
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules dir doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules dir doesn't exist

			// Mock legacy file reading
			mockFs.readFile.mockResolvedValueOnce("legacy rule content")

			const result = await loadRuleFiles(mockCwd)

			expect(result).toContain("# Rules from .roorules:")
			expect(result).toContain("legacy rule content")
		})

		it("should return empty string when no rules exist anywhere", async () => {
			// Mock directory existence - neither exist
			mockFs.stat
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules dir doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules dir doesn't exist

			// Mock legacy file reading - both fail
			mockFs.readFile
				.mockRejectedValueOnce(new Error("ENOENT")) // .roorules doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // .clinerules doesn't exist

			const result = await loadRuleFiles(mockCwd)

			expect(result).toBe("")
		})
	})

	describe("addCustomInstructions mode-specific rules", () => {
		it("should load global and project mode-specific rules", async () => {
			const mode = "code"

			// Mock directory existence for mode-specific rules
			mockFs.stat
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // global rules-code dir exists
				.mockResolvedValueOnce({ isDirectory: () => true } as any) // project rules-code dir exists
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules dir doesn't exist (for generic rules)
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules dir doesn't exist (for generic rules)

			// Mock directory reading for mode-specific rules
			mockFs.readdir
				.mockResolvedValueOnce([
					{ name: "global-mode.md", isFile: () => true, isSymbolicLink: () => false } as any,
				])
				.mockResolvedValueOnce([
					{ name: "project-mode.md", isFile: () => true, isSymbolicLink: () => false } as any,
				])

			// Mock file reading for mode-specific rules
			mockFs.stat
				.mockResolvedValueOnce({ isFile: () => true } as any) // global mode file check
				.mockResolvedValueOnce({ isFile: () => true } as any) // project mode file check

			mockFs.readFile
				.mockResolvedValueOnce("global mode rule content")
				.mockResolvedValueOnce("project mode rule content")
				.mockRejectedValueOnce(new Error("ENOENT")) // .roorules legacy file
				.mockRejectedValueOnce(new Error("ENOENT")) // .clinerules legacy file

			const result = await addCustomInstructions("", "", mockCwd, mode)

			expect(result).toContain("# Global mode-specific rules:")
			expect(result).toContain("global mode rule content")
			expect(result).toContain("# Project-specific mode-specific rules:")
			expect(result).toContain("project mode rule content")
		})

		it("should fall back to legacy mode-specific files when no mode directories exist", async () => {
			const mode = "code"

			// Mock directory existence - mode-specific dirs don't exist
			mockFs.stat
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules-code dir doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules-code dir doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // global rules dir doesn't exist
				.mockRejectedValueOnce(new Error("ENOENT")) // project rules dir doesn't exist

			// Mock legacy mode file reading
			mockFs.readFile
				.mockResolvedValueOnce("legacy mode rule content") // .roorules-code
				.mockRejectedValueOnce(new Error("ENOENT")) // generic .roorules
				.mockRejectedValueOnce(new Error("ENOENT")) // generic .clinerules

			const result = await addCustomInstructions("", "", mockCwd, mode)

			expect(result).toContain("# Rules from .roorules-code:")
			expect(result).toContain("legacy mode rule content")
		})
	})
})
