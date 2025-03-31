import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { TaskTree } from "../components/history/TaskTree"

// Mock the TaskItem component
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

jest.mock("../components/history/TaskItem", () => ({
	TaskItem: ({
		task,
		toggleExpanded,
		toggleSelection,
		onClick,
		isSelected,
		hasChildren,
		isExpanded,
		level,
	}: {
		task: HistoryItem
		toggleExpanded: (e: React.MouseEvent) => void
		toggleSelection: (isSelected: boolean) => void
		onClick: () => void
		isSelected: boolean
		hasChildren: boolean
		isExpanded: boolean
		level: number
	}) => (
		<div
			data-testid={`task-item-${task.id}`}
			data-level={level}
			data-has-children={hasChildren}
			data-is-expanded={isExpanded}
			data-is-selected={isSelected}>
			<span>{task.task}</span>
			{hasChildren && (
				<button data-testid={`expand-button-${task.id}`} onClick={(e) => toggleExpanded(e)}>
					{isExpanded ? "Collapse" : "Expand"}
				</button>
			)}
			<input
				type="checkbox"
				data-testid={`select-checkbox-${task.id}`}
				checked={isSelected}
				onChange={(e) => toggleSelection(e.target.checked)}
			/>
			<button data-testid={`click-task-${task.id}`} onClick={onClick}>
				Click
			</button>
		</div>
	),
}))

describe("TaskTree", () => {
	const mockTasks = [
		{
			id: "parent1",
			number: 1,
			ts: 1648000000000,
			task: "Parent Task 1",
			tokensIn: 100,
			tokensOut: 200,
			totalCost: 0.01,
			childIds: ["child1", "child2"],
		},
		{
			id: "child1",
			number: 2,
			ts: 1648000100000,
			task: "Child Task 1",
			tokensIn: 50,
			tokensOut: 100,
			totalCost: 0.005,
			parentId: "parent1",
		},
		{
			id: "child2",
			number: 3,
			ts: 1648000200000,
			task: "Child Task 2",
			tokensIn: 50,
			tokensOut: 100,
			totalCost: 0.005,
			parentId: "parent1",
		},
		{
			id: "parent2",
			number: 4,
			ts: 1648000300000,
			task: "Parent Task 2",
			tokensIn: 150,
			tokensOut: 250,
			totalCost: 0.015,
			childIds: ["child3"],
		},
		{
			id: "child3",
			number: 5,
			ts: 1648000400000,
			task: "Child Task 3",
			tokensIn: 75,
			tokensOut: 125,
			totalCost: 0.0075,
			parentId: "parent2",
		},
	]

	const mockProps = {
		tasks: mockTasks,
		isSelectionMode: false,
		selectedTaskIds: [],
		toggleTaskSelection: jest.fn(),
		onTaskClick: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it("renders root tasks initially", () => {
		render(<TaskTree {...mockProps} />)

		// Should render only parent tasks initially
		expect(screen.getByTestId("task-item-parent1")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-parent2")).toBeInTheDocument()

		// Child tasks should not be rendered initially
		expect(screen.queryByTestId("task-item-child1")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-child2")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-child3")).not.toBeInTheDocument()
	})

	it("expands and collapses parent tasks when clicked", () => {
		render(<TaskTree {...mockProps} />)

		// Initially, child tasks are not visible
		expect(screen.queryByTestId("task-item-child1")).not.toBeInTheDocument()

		// Click to expand parent1
		fireEvent.click(screen.getByTestId("expand-button-parent1"))

		// Now child tasks of parent1 should be visible
		expect(screen.getByTestId("task-item-child1")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-child2")).toBeInTheDocument()

		// Click to collapse parent1
		fireEvent.click(screen.getByTestId("expand-button-parent1"))

		// Child tasks should be hidden again
		expect(screen.queryByTestId("task-item-child1")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-child2")).not.toBeInTheDocument()
	})

	it("calls onTaskClick when a task is clicked", () => {
		render(<TaskTree {...mockProps} />)

		// Click on parent1
		fireEvent.click(screen.getByTestId("click-task-parent1"))

		// onTaskClick should be called with parent1's id
		expect(mockProps.onTaskClick).toHaveBeenCalledWith("parent1")
	})

	it("handles selection mode correctly", () => {
		const selectionProps = {
			...mockProps,
			isSelectionMode: true,
			selectedTaskIds: ["parent1"],
		}

		render(<TaskTree {...selectionProps} />)

		// parent1 should be selected
		expect(screen.getByTestId("task-item-parent1")).toHaveAttribute("data-is-selected", "true")

		// parent2 should not be selected
		expect(screen.getByTestId("task-item-parent2")).toHaveAttribute("data-is-selected", "false")

		// Toggle selection for parent2
		fireEvent.change(screen.getByTestId("select-checkbox-parent2"), { target: { checked: true } })

		// toggleTaskSelection should be called with parent2's id and true
		expect(mockProps.toggleTaskSelection).toHaveBeenCalledWith("parent2", true)
	})

	it("renders tasks with correct indentation levels", () => {
		render(<TaskTree {...mockProps} />)

		// Expand parent1 to see child tasks
		fireEvent.click(screen.getByTestId("expand-button-parent1"))

		// Parent tasks should have level 0
		expect(screen.getByTestId("task-item-parent1")).toHaveAttribute("data-level", "0")

		// Child tasks should have level 1
		expect(screen.getByTestId("task-item-child1")).toHaveAttribute("data-level", "1")
		expect(screen.getByTestId("task-item-child2")).toHaveAttribute("data-level", "1")
	})
})
