import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { BatchFilePermission } from "../BatchFilePermission"
import { TranslationProvider } from "@/i18n/__mocks__/TranslationContext"

const mockOnPermissionResponse = jest.fn()
const mockVscodePostMessage = jest.fn()

// Mock vscode API
jest.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (message: any) => mockVscodePostMessage(message),
	},
}))

// Mock shiki module
jest.mock("shiki", () => ({
	bundledLanguages: {
		typescript: {},
		javascript: {},
		txt: {},
	},
}))

// Mock the highlighter utility
jest.mock("@src/utils/highlighter", () => {
	const mockHighlighter = {
		codeToHtml: jest.fn().mockImplementation((code, options) => {
			const theme = options?.theme === "github-light" ? "light" : "dark"
			return `<pre><code class="hljs language-${options?.lang || "txt"}">${code} [${theme}-theme]</code></pre>`
		}),
	}

	return {
		normalizeLanguage: jest.fn((lang) => lang || "txt"),
		isLanguageLoaded: jest.fn().mockReturnValue(true),
		getHighlighter: jest.fn().mockResolvedValue(mockHighlighter),
	}
})

const mockFiles = [
	{
		path: "src/components/Button.tsx",
		lineSnippet: "export const Button = () => {",
		isOutsideWorkspace: false,
		key: "file1",
	},
	{
		path: "../outside/config.json",
		lineSnippet: '{ "apiKey": "..." }',
		isOutsideWorkspace: true,
		key: "file2",
	},
	{
		path: "tests/Button.test.tsx",
		lineSnippet: "describe('Button', () => {",
		isOutsideWorkspace: false,
		key: "file3",
	},
]

describe("BatchFilePermission", () => {
	beforeEach(() => {
		mockOnPermissionResponse.mockClear()
		mockVscodePostMessage.mockClear()
	})

	it("renders all files with their paths", () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		expect(screen.getByText(/Button\.tsx/)).toBeInTheDocument()
		expect(screen.getByText(/config\.json/)).toBeInTheDocument()
		expect(screen.getByText(/Button\.test\.tsx/)).toBeInTheDocument()
	})

	it("shows line snippets when provided", () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		expect(screen.getByText(/export const Button/)).toBeInTheDocument()
		expect(screen.getByText(/apiKey/)).toBeInTheDocument()
		expect(screen.getByText(/describe\('Button'/)).toBeInTheDocument()
	})

	it("indicates files outside workspace", () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Should show warning icon for outside workspace file
		const outsideWorkspaceIcons = screen.getAllByTitle("Outside workspace")
		expect(outsideWorkspaceIcons).toHaveLength(1)
	})

	it("handles approve all functionality", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		const approveAllButton = screen.getByLabelText("Accept All")
		fireEvent.click(approveAllButton)

		// Check that all files show approved state
		const approveButtons = screen.getAllByText("Approve")
		approveButtons.forEach((button) => {
			expect(button.closest("button")).toHaveClass("bg-primary/10")
		})
	})

	it("handles deny all functionality", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		const denyAllButton = screen.getByLabelText("Deny All")
		fireEvent.click(denyAllButton)

		// Check that all files show denied state
		const denyButtons = screen.getAllByText("Deny")
		denyButtons.forEach((button) => {
			expect(button.closest("button")).toHaveClass("bg-secondary/10")
		})
	})

	it("handles individual file approval", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Approve first file
		const approveButtons = screen.getAllByText("Approve")
		fireEvent.click(approveButtons[0])

		// First approve button should show active state
		expect(approveButtons[0].closest("button")).toHaveClass("bg-primary/10")
	})

	it("shows submit button when all decisions are made", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Initially no submit button in progress bar
		expect(screen.queryByText("Submit Decisions")).not.toBeInTheDocument()

		// Make all decisions
		const approveAllButton = screen.getByLabelText("Accept All")
		fireEvent.click(approveAllButton)

		// Now submit button should appear
		await waitFor(() => {
			expect(screen.getByText("Submit Decisions")).toBeInTheDocument()
		})
	})

	it("submits decisions when submit button is clicked", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Approve all
		const approveAllButton = screen.getByLabelText("Accept All")
		fireEvent.click(approveAllButton)

		// Submit
		const submitButton = await screen.findByText("Submit Decisions")
		fireEvent.click(submitButton)

		expect(mockOnPermissionResponse).toHaveBeenCalledWith({
			file1: true,
			file2: true,
			file3: true,
		})
	})

	it("opens file when clicking on file path", () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Click on first file header
		const fileHeaders = screen.getAllByRole("button", { name: /Button\.tsx/ })
		fireEvent.click(fileHeaders[0])

		expect(mockVscodePostMessage).toHaveBeenCalledWith({
			type: "openFile",
			text: "src/components/Button.tsx",
		})
	})

	it("shows progress indicators", async () => {
		render(
			<TranslationProvider>
				<BatchFilePermission
					files={mockFiles}
					onPermissionResponse={mockOnPermissionResponse}
					ts={Date.now()}
				/>
			</TranslationProvider>,
		)

		// Initially no progress bar
		expect(screen.queryByText("Progress:")).not.toBeInTheDocument()

		// Approve one file
		const approveButtons = screen.getAllByText("Approve")
		fireEvent.click(approveButtons[0])

		// Progress should show
		await waitFor(() => {
			expect(screen.getByText("Progress:")).toBeInTheDocument()
			expect(screen.getByText("1 approved")).toBeInTheDocument()
			expect(screen.getByText("2 pending")).toBeInTheDocument()
		})
	})

	it("resets state when files change", () => {
		const { rerender } = render(
			<TranslationProvider>
				<BatchFilePermission files={mockFiles} onPermissionResponse={mockOnPermissionResponse} ts={1} />
			</TranslationProvider>,
		)

		// Approve a file
		const approveButtons = screen.getAllByText("Approve")
		fireEvent.click(approveButtons[0])

		// Re-render with new timestamp
		rerender(
			<TranslationProvider>
				<BatchFilePermission files={mockFiles} onPermissionResponse={mockOnPermissionResponse} ts={2} />
			</TranslationProvider>,
		)

		// All buttons should be reset
		const newApproveButtons = screen.getAllByText("Approve")
		newApproveButtons.forEach((button) => {
			expect(button.closest("button")).not.toHaveClass("bg-primary/10")
		})
	})
})
