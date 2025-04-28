import React from "react"
import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"

/**
 * A component that displays the current status of context summarization
 */
export const SummarizationIndicator: React.FC = () => {
	const { summarizationStatus } = useExtensionState()

	if (!summarizationStatus) {
		return null
	}

	return (
		<div
			className={cn(
				"flex items-center p-3 my-2 rounded-md transition-all duration-300",
				summarizationStatus.status === "started"
					? "bg-vscode-inputValidation-infoBackground border border-vscode-inputValidation-infoBorder"
					: summarizationStatus.status === "completed"
						? "bg-vscode-inputValidation-successBackground border border-vscode-inputValidation-successBorder"
						: "bg-vscode-inputValidation-errorBackground border border-vscode-inputValidation-errorBorder",
			)}>
			{summarizationStatus.status === "started" && (
				<span className="codicon codicon-loading codicon-modifier-spin mr-2" />
			)}
			{summarizationStatus.status === "completed" && <span className="codicon codicon-check mr-2" />}
			{summarizationStatus.status === "failed" && <span className="codicon codicon-error mr-2" />}
			<span className="text-vscode-foreground">{summarizationStatus.text}</span>
		</div>
	)
}

export default SummarizationIndicator
