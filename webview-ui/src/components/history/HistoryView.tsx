import React, { memo, useState } from "react"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { BatchDeleteTaskDialog } from "./BatchDeleteTaskDialog"
import {
	VSCodeButton,
	VSCodeTextField,
	VSCodeRadioGroup,
	VSCodeRadio,
	VSCodeCheckbox,
} from "@vscode/webview-ui-toolkit/react"

import { vscode } from "@/utils/vscode"
import { useAppTranslation } from "@/i18n/TranslationContext"

import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useTaskSearch } from "./useTaskSearch"
import { TaskTree } from "./TaskTree"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const { tasks, searchQuery, setSearchQuery, sortOption, setSortOption, setLastNonRelevantSort } = useTaskSearch()
	const { t } = useAppTranslation()

	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)

	// Toggle selection mode
	const toggleSelectionMode = () => {
		setIsSelectionMode(!isSelectionMode)
		if (isSelectionMode) {
			setSelectedTaskIds([])
		}
	}

	// Toggle selection for a single task
	const toggleTaskSelection = (taskId: string, isSelected: boolean) => {
		setSelectedTaskIds((prev) => (isSelected ? [...prev, taskId] : prev.filter((id) => id !== taskId)))
	}

	// Toggle select all tasks
	const toggleSelectAll = (selectAll: boolean) => {
		setSelectedTaskIds(selectAll ? tasks.map((task) => task.id) : [])
	}

	// Handle batch delete button click
	const handleBatchDelete = () => {
		if (selectedTaskIds.length > 0) {
			setShowBatchDeleteDialog(true)
		}
	}

	return (
		<Tab>
			<TabHeader className="flex flex-col gap-2">
				<div className="flex justify-between items-center">
					<h3 className="text-vscode-foreground m-0">{t("history:history")}</h3>
					<div className="flex gap-2">
						<VSCodeButton
							appearance={isSelectionMode ? "primary" : "secondary"}
							onClick={toggleSelectionMode}
							title={
								isSelectionMode
									? `${t("history:exitSelectionMode")}`
									: `${t("history:enterSelectionMode")}`
							}>
							<span
								className={`codicon ${isSelectionMode ? "codicon-check-all" : "codicon-checklist"}`}
							/>
							{isSelectionMode ? t("history:exitSelection") : t("history:selectionMode")}
						</VSCodeButton>
						<VSCodeButton onClick={onDone}>{t("history:done")}</VSCodeButton>
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<VSCodeTextField
						style={{ width: "100%" }}
						placeholder={t("history:searchPlaceholder")}
						value={searchQuery}
						data-testid="history-search-input"
						onInput={(e) => {
							const newValue = (e.target as HTMLInputElement)?.value
							setSearchQuery(newValue)
							if (newValue && !searchQuery && sortOption !== "mostRelevant") {
								setLastNonRelevantSort(sortOption)
								setSortOption("mostRelevant")
							}
						}}>
						<div
							slot="start"
							className="codicon codicon-search"
							style={{ fontSize: 13, marginTop: 2.5, opacity: 0.8 }}
						/>
						{searchQuery && (
							<button
								className="input-icon-button codicon codicon-close"
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}
								slot="end"
								style={{
									display: "flex",
									justifyContent: "center",
									alignItems: "center",
									height: "100%",
								}}
							/>
						)}
					</VSCodeTextField>
					<VSCodeRadioGroup
						style={{ display: "flex", flexWrap: "wrap" }}
						value={sortOption}
						role="radiogroup"
						onChange={(e) => setSortOption((e.target as HTMLInputElement).value as SortOption)}>
						<VSCodeRadio value="newest" data-testid="radio-newest">
							{t("history:newest")}
						</VSCodeRadio>
						<VSCodeRadio value="oldest" data-testid="radio-oldest">
							{t("history:oldest")}
						</VSCodeRadio>
						<VSCodeRadio value="mostExpensive" data-testid="radio-most-expensive">
							{t("history:mostExpensive")}
						</VSCodeRadio>
						<VSCodeRadio value="mostTokens" data-testid="radio-most-tokens">
							{t("history:mostTokens")}
						</VSCodeRadio>
						<VSCodeRadio
							value="mostRelevant"
							disabled={!searchQuery}
							data-testid="radio-most-relevant"
							style={{ opacity: searchQuery ? 1 : 0.5 }}>
							{t("history:mostRelevant")}
						</VSCodeRadio>
					</VSCodeRadioGroup>

					{/* Select all control in selection mode */}
					{isSelectionMode && tasks.length > 0 && (
						<div className="flex items-center py-1 px-2 bg-vscode-editor-background rounded">
							<VSCodeCheckbox
								checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
								onChange={(e) => toggleSelectAll((e.target as HTMLInputElement).checked)}
							/>
							<span className="ml-2 text-vscode-foreground">
								{selectedTaskIds.length === tasks.length
									? t("history:deselectAll")
									: t("history:selectAll")}
							</span>
							<span className="ml-auto text-vscode-descriptionForeground text-xs">
								{t("history:selectedItems", { selected: selectedTaskIds.length, total: tasks.length })}
							</span>
						</div>
					)}
				</div>
			</TabHeader>

			<TabContent className="p-0">
				<div className="flex-1 overflow-y-auto">
					<TaskTree
						tasks={tasks}
						isSelectionMode={isSelectionMode}
						selectedTaskIds={selectedTaskIds}
						toggleTaskSelection={toggleTaskSelection}
						onTaskClick={(taskId) => vscode.postMessage({ type: "showTaskWithId", text: taskId })}
					/>
				</div>
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedTaskIds.length > 0 && (
				<div className="fixed bottom-0 left-0 right-0 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center">
					<div className="text-vscode-foreground">
						{t("history:selectedItems", { selected: selectedTaskIds.length, total: tasks.length })}
					</div>
					<div className="flex gap-2">
						<VSCodeButton appearance="secondary" onClick={() => setSelectedTaskIds([])}>
							{t("history:clearSelection")}
						</VSCodeButton>
						<VSCodeButton appearance="primary" onClick={handleBatchDelete}>
							{t("history:deleteSelected")}
						</VSCodeButton>
					</div>
				</div>
			)}

			{/* Delete dialog */}
			{deleteTaskId && (
				<DeleteTaskDialog taskId={deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)} open />
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteTaskDialog
					taskIds={selectedTaskIds}
					open={showBatchDeleteDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowBatchDeleteDialog(false)
							setSelectedTaskIds([])
							setIsSelectionMode(false)
						}
					}}
				/>
			)}
		</Tab>
	)
}

export default memo(HistoryView)
