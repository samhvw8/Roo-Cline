import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import HistoryView from "../components/history/HistoryView"
import { useTaskSearch } from "../components/history/useTaskSearch"
import { HistoryItem } from "../../../src/schemas"

// Mock the useTaskSearch hook
jest.mock("../components/history/useTaskSearch", () => ({
	useTaskSearch: jest.fn(),
}))

// Mock the TaskTree component
jest.mock("../components/history/TaskTree", () => ({
	TaskTree: ({
		tasks,
		isSelectionMode,
		selectedTaskIds,
		toggleTaskSelection,
		onTaskClick,
	}: {
		tasks: HistoryItem[]
		isSelectionMode: boolean
		selectedTaskIds: string[]
		toggleTaskSelection: (taskId: string, isSelected: boolean) => void
		onTaskClick: (taskId: string) => void
	}) => (
		<div data-testid="task-tree-mock">
			<div>Tasks count: {tasks.length}</div>
			<div>Selection mode: {isSelectionMode ? "true" : "false"}</div>
			<div>Selected tasks: {selectedTaskIds.length}</div>
			<button data-testid="toggle-selection-button" onClick={() => toggleTaskSelection("task1", true)}>
				Toggle Selection
			</button>
			<button data-testid="click-task-button" onClick={() => onTaskClick("task1")}>
				Click Task
			</button>
		</div>
	),
}))

// Mock the vscode API
jest.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: jest.fn(),
	},
}))

// Mock the translation function
jest.mock("../i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

// Mock the DeleteTaskDialog and BatchDeleteTaskDialog components
jest.mock("../components/history/DeleteTaskDialog", () => ({
	DeleteTaskDialog: ({
		taskId,
		onOpenChange,
		open,
	}: {
		taskId: string
		onOpenChange: (open: boolean) => void
		open: boolean
	}) => (open ? <div data-testid="delete-dialog-mock">Delete Task: {taskId}</div> : null),
}))

jest.mock("../components/history/BatchDeleteTaskDialog", () => ({
	BatchDeleteTaskDialog: ({
		taskIds,
		onOpenChange,
		open,
	}: {
		taskIds: string[]
		onOpenChange: (open: boolean) => void
		open: boolean
	}) => (open ? <div data-testid="batch-delete-dialog-mock">Delete Tasks: {taskIds.length}</div> : null),
}))

describe("HistoryView", () => {
	const mockTasks = [
		{
			id: "task1",
			number: 1,
			ts: 1648000000000,
			task: "Task 1",
			tokensIn: 100,
			tokensOut: 200,
			totalCost: 0.01,
		},
		{
			id: "task2",
			number: 2,
			ts: 1648000100000,
			task: "Task 2",
			tokensIn: 150,
			tokensOut: 250,
			totalCost: 0.015,
		},
	]

	const mockTaskSearch = {
		tasks: mockTasks,
		searchQuery: "",
		setSearchQuery: jest.fn(),
		sortOption: "newest",
		setSortOption: jest.fn(),
		lastNonRelevantSort: null,
		setLastNonRelevantSort: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
		;(useTaskSearch as jest.Mock).mockReturnValue(mockTaskSearch)
	})

	it("renders the history view with task tree", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// Check if the task tree is rendered
		expect(screen.getByTestId("task-tree-mock")).toBeInTheDocument()
		expect(screen.getByText("Tasks count: 2")).toBeInTheDocument()
		expect(screen.getByText("Selection mode: false")).toBeInTheDocument()
	})

	it("toggles selection mode", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// Initially not in selection mode
		expect(screen.getByText("Selection mode: false")).toBeInTheDocument()

		// Click the selection mode button
		fireEvent.click(screen.getByText("history:selectionMode"))

		// Now in selection mode
		expect(screen.getByText("Selection mode: true")).toBeInTheDocument()

		// Click again to exit selection mode
		fireEvent.click(screen.getByText("history:exitSelection"))

		// Back to not in selection mode
		expect(screen.getByText("Selection mode: false")).toBeInTheDocument()
	})

	it("handles task selection", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// Enter selection mode
		fireEvent.click(screen.getByText("history:selectionMode"))

		// Initially no tasks selected
		expect(screen.getByText("Selected tasks: 0")).toBeInTheDocument()

		// Select a task
		fireEvent.click(screen.getByTestId("toggle-selection-button"))

		// Now one task is selected
		expect(screen.getByText("Selected tasks: 1")).toBeInTheDocument()
	})

	it("shows delete dialog when a task is selected for deletion", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// No delete dialog initially
		expect(screen.queryByTestId("delete-dialog-mock")).not.toBeInTheDocument()

		// Enter selection mode
		fireEvent.click(screen.getByText("history:selectionMode"))

		// Select a task
		fireEvent.click(screen.getByTestId("toggle-selection-button"))

		// Click delete button
		fireEvent.click(screen.getByText("history:deleteSelected"))

		// Delete dialog should be shown
		expect(screen.getByTestId("batch-delete-dialog-mock")).toBeInTheDocument()
		expect(screen.getByText("Delete Tasks: 1")).toBeInTheDocument()
	})

	it("handles search input", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// Find the search input
		const searchInput = screen.getByTestId("history-search-input").querySelector("input")
		expect(searchInput).toBeInTheDocument()

		// Type in the search input
		if (searchInput) {
			fireEvent.input(searchInput, { target: { value: "test search" } })
		}

		// Search function should be called
		expect(mockTaskSearch.setSearchQuery).toHaveBeenCalledWith("test search")
	})

	it("handles sort option change", () => {
		render(<HistoryView onDone={jest.fn()} />)

		// Find the radio buttons
		const oldestRadio = screen.getByTestId("radio-oldest").querySelector("input")
		expect(oldestRadio).toBeInTheDocument()

		// Change the sort option
		if (oldestRadio) {
			fireEvent.change(oldestRadio, { target: { value: "oldest" } })
		}

		// Sort function should be called
		expect(mockTaskSearch.setSortOption).toHaveBeenCalledWith("oldest")
	})

	it("calls onDone when done button is clicked", () => {
		const onDoneMock = jest.fn()
		render(<HistoryView onDone={onDoneMock} />)

		// Click the done button
		fireEvent.click(screen.getByText("history:done"))

		// onDone should be called
		expect(onDoneMock).toHaveBeenCalled()
	})
})
