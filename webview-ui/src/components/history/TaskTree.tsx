import React, { useState, useMemo } from "react"
import { TaskItem } from "./TaskItem"

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

type TaskTreeProps = {
	tasks: HistoryItem[]
	isSelectionMode: boolean
	selectedTaskIds: string[]
	toggleTaskSelection: (taskId: string, isSelected: boolean) => void
	onTaskClick: (taskId: string) => void
}

/**
 * Organizes tasks into a tree structure based on parent-child relationships
 */
export const TaskTree: React.FC<TaskTreeProps> = ({
	tasks,
	isSelectionMode,
	selectedTaskIds,
	toggleTaskSelection,
	onTaskClick,
}) => {
	// Track expanded state of parent tasks
	const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())

	// Toggle expanded state for a task
	const toggleExpanded = (taskId: string, event: React.MouseEvent) => {
		event.stopPropagation()
		setExpandedTaskIds((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(taskId)) {
				newSet.delete(taskId)
			} else {
				newSet.add(taskId)
			}
			return newSet
		})
	}

	// Organize tasks into a tree structure
	const { rootTasks, taskMap } = useMemo(() => {
		const map = new Map<string, HistoryItem & { children: HistoryItem[] }>()

		// First pass: create map entries for all tasks with empty children arrays
		tasks.forEach((task) => {
			map.set(task.id, { ...task, children: [] })
		})

		// Second pass: populate children arrays
		const roots: HistoryItem[] = []
		tasks.forEach((task) => {
			const taskWithChildren = map.get(task.id)
			if (!taskWithChildren) return

			if (task.parentId && map.has(task.parentId)) {
				// This is a child task, add it to its parent's children
				const parent = map.get(task.parentId)
				if (parent) {
					parent.children.push(taskWithChildren)
				}
			} else {
				// This is a root task
				roots.push(taskWithChildren)
			}
		})

		return { rootTasks: roots, taskMap: map }
	}, [tasks])

	// Render the tree recursively
	const renderTaskTree = (tasks: HistoryItem[], level = 0) => {
		return tasks.map((task) => {
			const taskWithChildren = taskMap.get(task.id)
			const hasChildren = !!(taskWithChildren?.children && taskWithChildren.children.length > 0)
			const isExpanded = expandedTaskIds.has(task.id)

			return (
				<React.Fragment key={task.id}>
					<TaskItem
						task={task}
						level={level}
						hasChildren={hasChildren}
						isExpanded={isExpanded}
						isSelectionMode={isSelectionMode}
						isSelected={selectedTaskIds.includes(task.id)}
						toggleExpanded={(e: React.MouseEvent) => toggleExpanded(task.id, e)}
						toggleSelection={(isSelected: boolean) => toggleTaskSelection(task.id, isSelected)}
						onClick={() => onTaskClick(task.id)}
					/>
					{/* Render children if this task is expanded */}
					{hasChildren && isExpanded && renderTaskTree(taskWithChildren.children, level + 1)}
				</React.Fragment>
			)
		})
	}

	return <div className="task-tree">{renderTaskTree(rootTasks)}</div>
}
