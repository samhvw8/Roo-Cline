import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { TaskItem } from "../components/history/TaskItem"

// Mock the CopyButton and ExportButton components
jest.mock("../components/history/CopyButton", () => ({
	CopyButton: ({ itemTask }: { itemTask: string }) => (
		<button data-testid="copy-button">{`Copy: ${itemTask.substring(0, 10)}...`}</button>
	),
}))

jest.mock("../components/history/ExportButton", () => ({
	ExportButton: ({ itemId }: { itemId: string }) => (
		<button data-testid="export-button">{`Export: ${itemId}`}</button>
	),
}))

// Mock the translation function
jest.mock("../i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Define the HistoryItem type for testing
type HistoryItem = {
	id: string
	number: number
	ts: number
	task: string
	tokensIn: number
	tokensOut: number
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	size?: number
	parentId?: string
	rootId?: string
	childIds?: string[]
}

describe("TaskItem", () => {
	const mockTask: HistoryItem = {
		id: "task1",
		number: 1,
		ts: 1648000000000, // March 23, 2022
		task: "Test task content",
		tokensIn: 100,
		tokensOut: 200,
		cacheWrites: 50,
		cacheReads: 25,
		totalCost: 0.01,
		size: 1024,
	}

	const defaultProps = {
		task: mockTask,
		level: 0,
		hasChildren: false,
		isExpanded: false,
		isSelectionMode: false,
		isSelected: false,
		toggleExpanded: jest.fn(),
		toggleSelection: jest.fn(),
		onClick: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("renders task content correctly", () => {
		render(<TaskItem {...defaultProps} />)

		// Task content should be rendered
		expect(screen.getByTestId("task-content")).toHaveAttribute(
			"dangerouslySetInnerHTML",
			expect.objectContaining({ __html: mockTask.task }),
		)

		// Token information should be displayed
		expect(screen.getByTestId("tokens-in")).toBeInTheDocument()
		expect(screen.getByTestId("tokens-out")).toBeInTheDocument()

		// Cache information should be displayed
		expect(screen.getByTestId("cache-container")).toBeInTheDocument()
		expect(screen.getByTestId("cache-writes")).toBeInTheDocument()
		expect(screen.getByTestId("cache-reads")).toBeInTheDocument()

		// Cost information should be displayed
		expect(screen.getByText("$0.0100")).toBeInTheDocument()
	})

	it("applies correct indentation based on level", () => {
		const { rerender } = render(<TaskItem {...defaultProps} level={0} />)

		// Level 0 should have pl-3 class
		expect(screen.getByTestId("task-item-task1").querySelector("div")).toHaveClass("pl-3")

		// Rerender with level 1
		rerender(<TaskItem {...defaultProps} level={1} />)

		// Level 1 should have pl-7 class
		expect(screen.getByTestId("task-item-task1").querySelector("div")).toHaveClass("pl-7")

		// Rerender with level 2
		rerender(<TaskItem {...defaultProps} level={2} />)

		// Level 2 should have pl-11 class
		expect(screen.getByTestId("task-item-task1").querySelector("div")).toHaveClass("pl-11")
	})

	it("shows expand/collapse button for parent tasks", () => {
		const { rerender } = render(<TaskItem {...defaultProps} hasChildren={true} />)

		// Expand button should be visible
		const expandButton = screen.getByRole("button", { name: "Expand" })
		expect(expandButton).toBeInTheDocument()
		expect(expandButton.querySelector(".codicon-chevron-right")).toBeInTheDocument()

		// Rerender with expanded state
		rerender(<TaskItem {...defaultProps} hasChildren={true} isExpanded={true} />)

		// Collapse button should be visible
		const collapseButton = screen.getByRole("button", { name: "Collapse" })
		expect(collapseButton).toBeInTheDocument()
		expect(collapseButton.querySelector(".codicon-chevron-down")).toBeInTheDocument()
	})

	it("handles expand/collapse button click", () => {
		render(<TaskItem {...defaultProps} hasChildren={true} />)

		// Click the expand button
		fireEvent.click(screen.getByRole("button", { name: "Expand" }))

		// toggleExpanded should be called
		expect(defaultProps.toggleExpanded).toHaveBeenCalled()
	})

	it("shows checkbox in selection mode", () => {
		const { rerender } = render(<TaskItem {...defaultProps} isSelectionMode={true} />)

		// Checkbox should be visible
		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeInTheDocument()
		expect(checkbox).not.toBeChecked()

		// Rerender with selected state
		rerender(<TaskItem {...defaultProps} isSelectionMode={true} isSelected={true} />)

		// Checkbox should be checked
		expect(screen.getByRole("checkbox")).toBeChecked()
	})

	it("handles checkbox change", () => {
		render(<TaskItem {...defaultProps} isSelectionMode={true} />)

		// Change the checkbox
		fireEvent.change(screen.getByRole("checkbox"), { target: { checked: true } })

		// toggleSelection should be called with true
		expect(defaultProps.toggleSelection).toHaveBeenCalledWith(true)
	})

	it("calls onClick when clicked", () => {
		render(<TaskItem {...defaultProps} />)

		// Click the task item
		fireEvent.click(screen.getByTestId("task-item-task1"))

		// onClick should be called
		expect(defaultProps.onClick).toHaveBeenCalled()
	})

	it("doesn't call onClick when clicking on checkbox in selection mode", () => {
		render(<TaskItem {...defaultProps} isSelectionMode={true} />)

		// Click the checkbox
		fireEvent.click(screen.getByRole("checkbox"))

		// onClick should not be called
		expect(defaultProps.onClick).not.toHaveBeenCalled()
	})

	it("shows delete button when not in selection mode", () => {
		render(<TaskItem {...defaultProps} />)

		// Delete button should be visible
		expect(screen.getByTestId("delete-task-button")).toBeInTheDocument()
	})

	it("hides delete button in selection mode", () => {
		render(<TaskItem {...defaultProps} isSelectionMode={true} />)

		// Delete button should not be visible
		expect(screen.queryByTestId("delete-task-button")).not.toBeInTheDocument()
	})

	it("shows copy and export buttons", () => {
		render(<TaskItem {...defaultProps} />)

		// Copy and export buttons should be visible
		expect(screen.getByTestId("copy-button")).toBeInTheDocument()
		expect(screen.getByTestId("export-button")).toBeInTheDocument()
	})
})
