import React from "react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import prettyBytes from "pretty-bytes"
import { formatLargeNumber, formatDate } from "@/utils/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"

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

type TaskItemProps = {
	task: HistoryItem
	level: number
	hasChildren: boolean
	isExpanded: boolean
	isSelectionMode: boolean
	isSelected: boolean
	toggleExpanded: (e: React.MouseEvent) => void
	toggleSelection: (isSelected: boolean) => void
	onClick: () => void
}

export const TaskItem: React.FC<TaskItemProps> = ({
	task,
	level,
	hasChildren,
	isExpanded,
	isSelectionMode,
	isSelected,
	toggleExpanded,
	toggleSelection,
	onClick,
}) => {
	const { t } = useAppTranslation()

	// Calculate indentation based on level
	const indentationClass = `pl-${level * 4 + 3}`

	return (
		<div
			data-testid={`task-item-${task.id}`}
			className={cn("cursor-pointer", {
				"border-b border-vscode-panel-border": true,
				"bg-vscode-list-activeSelectionBackground": isSelectionMode && isSelected,
			})}
			onClick={(e) => {
				if (!isSelectionMode || !(e.target as HTMLElement).closest(".task-checkbox")) {
					onClick()
				}
			}}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					if (!isSelectionMode || !(e.target as HTMLElement).closest(".task-checkbox")) {
						onClick()
					}
				}
			}}>
			<div className={cn("flex items-start p-3 gap-2", indentationClass)}>
				{/* Tree connector lines */}
				{level > 0 && (
					<div
						className="absolute left-0 h-full border-l border-vscode-panel-border"
						style={{ left: `${level * 16}px` }}
					/>
				)}

				{/* Expand/collapse button for parent tasks */}
				{hasChildren && (
					<button
						className="flex items-center justify-center w-5 h-5 mr-1 text-vscode-descriptionForeground hover:text-vscode-foreground"
						onClick={toggleExpanded}
						aria-label={isExpanded ? "Collapse" : "Expand"}>
						<span className={`codicon ${isExpanded ? "codicon-chevron-down" : "codicon-chevron-right"}`} />
					</button>
				)}

				{/* Show checkbox in selection mode */}
				{isSelectionMode && (
					<div
						className="task-checkbox mt-1"
						onClick={(e) => {
							e.stopPropagation()
						}}
						role="presentation">
						<VSCodeCheckbox
							checked={isSelected}
							onChange={(e) => toggleSelection((e.target as HTMLInputElement).checked)}
						/>
					</div>
				)}

				<div className="flex-1">
					<div className="flex justify-between items-center">
						<span className="text-vscode-descriptionForeground font-medium text-sm uppercase">
							{formatDate(task.ts)}
						</span>
						<div className="flex flex-row">
							{!isSelectionMode && (
								<Button
									variant="ghost"
									size="sm"
									title={t("history:deleteTaskTitle")}
									data-testid="delete-task-button"
									onClick={(e) => {
										e.stopPropagation()
										// Handle delete (this would be implemented in the parent component)
									}}>
									<span className="codicon codicon-trash" />
									{task.size && prettyBytes(task.size)}
								</Button>
							)}
						</div>
					</div>
					<div
						style={{
							fontSize: "var(--vscode-font-size)",
							color: "var(--vscode-foreground)",
							display: "-webkit-box",
							WebkitLineClamp: 3,
							WebkitBoxOrient: "vertical",
							overflow: "hidden",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							overflowWrap: "anywhere",
						}}
						data-testid="task-content"
						dangerouslySetInnerHTML={{ __html: task.task }}
					/>
					<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
						<div
							data-testid="tokens-container"
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
							}}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									flexWrap: "wrap",
								}}>
								<span
									style={{
										fontWeight: 500,
										color: "var(--vscode-descriptionForeground)",
									}}>
									{t("history:tokensLabel")}
								</span>
								<span
									data-testid="tokens-in"
									style={{
										display: "flex",
										alignItems: "center",
										gap: "3px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									<i
										className="codicon codicon-arrow-up"
										style={{
											fontSize: "12px",
											fontWeight: "bold",
											marginBottom: "-2px",
										}}
									/>
									{formatLargeNumber(task.tokensIn || 0)}
								</span>
								<span
									data-testid="tokens-out"
									style={{
										display: "flex",
										alignItems: "center",
										gap: "3px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									<i
										className="codicon codicon-arrow-down"
										style={{
											fontSize: "12px",
											fontWeight: "bold",
											marginBottom: "-2px",
										}}
									/>
									{formatLargeNumber(task.tokensOut || 0)}
								</span>
							</div>
							{!task.totalCost && !isSelectionMode && (
								<div className="flex flex-row gap-1">
									<CopyButton itemTask={task.task} />
									<ExportButton itemId={task.id} />
								</div>
							)}
						</div>

						{!!task.cacheWrites && (
							<div
								data-testid="cache-container"
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									flexWrap: "wrap",
								}}>
								<span
									style={{
										fontWeight: 500,
										color: "var(--vscode-descriptionForeground)",
									}}>
									{t("history:cacheLabel")}
								</span>
								<span
									data-testid="cache-writes"
									style={{
										display: "flex",
										alignItems: "center",
										gap: "3px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									<i
										className="codicon codicon-database"
										style={{
											fontSize: "12px",
											fontWeight: "bold",
											marginBottom: "-1px",
										}}
									/>
									+{formatLargeNumber(task.cacheWrites ?? 0)}
								</span>
								<span
									data-testid="cache-reads"
									style={{
										display: "flex",
										alignItems: "center",
										gap: "3px",
										color: "var(--vscode-descriptionForeground)",
									}}>
									<i
										className="codicon codicon-arrow-right"
										style={{
											fontSize: "12px",
											fontWeight: "bold",
											marginBottom: 0,
										}}
									/>
									{formatLargeNumber(task.cacheReads ?? 0)}
								</span>
							</div>
						)}

						{!!task.totalCost && (
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginTop: -2,
								}}>
								<div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
									<span
										style={{
											fontWeight: 500,
											color: "var(--vscode-descriptionForeground)",
										}}>
										{t("history:apiCostLabel")}
									</span>
									<span style={{ color: "var(--vscode-descriptionForeground)" }}>
										${task.totalCost?.toFixed(4)}
									</span>
								</div>
								{!isSelectionMode && (
									<div className="flex flex-row gap-1">
										<CopyButton itemTask={task.task} />
										<ExportButton itemId={task.id} />
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
