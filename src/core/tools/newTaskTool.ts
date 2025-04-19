import { Cline } from "../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { BaseTool } from "./BaseTool"
import { ToolName } from "../../schemas"

export class NewTaskTool extends BaseTool {
	name = "new_task" as ToolName
	description = "Create a new task with a specified starting mode and initial message"

	override getDescription(block: ToolUse): string {
		const mode = block.params.mode ?? defaultModeSlug
		const message = block.params.message ?? "(no message)"
		const modeName = getModeBySlug(mode)?.name ?? mode
		return `[${this.name} in ${modeName} mode: '${message}']`
	}

	async handler(
		cline: Cline,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	) {
		const mode: string | undefined = block.params.mode
		const message: string | undefined = block.params.message

		try {
			if (block.partial) {
				const partialMessage = JSON.stringify({
					tool: "newTask",
					mode: removeClosingTag("mode", mode),
					message: removeClosingTag("message", message),
				})

				await cline.ask("tool", partialMessage, block.partial).catch(() => {})
				return
			} else {
				if (!message) {
					cline.consecutiveMistakeCount++
					cline.recordToolError("new_task")
					pushToolResult(await cline.sayAndCreateMissingParamError("new_task", "message"))
					return
				}

				cline.consecutiveMistakeCount = 0

				// Verify the mode exists if specified
				if (mode) {
					const targetMode = getModeBySlug(mode, (await cline.providerRef.deref()?.getState())?.customModes)

					if (!targetMode) {
						cline.recordToolError("new_task")
						pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
						return
					}
				}

				const completeMessage = JSON.stringify({ tool: "newTask", mode, message })
				const didApprove = await askApproval("tool", completeMessage)

				if (!didApprove) {
					return
				}

				// Create new task
				const newCline = await cline.providerRef.deref()?.initClineWithSubTask(cline, message, undefined)

				if (!newCline) {
					pushToolResult(formatResponse.toolError("Failed to create new task"))
					return
				}

				// Pause current task until subtask completes
				cline.isPaused = true
				cline.pausedModeSlug = (await cline.providerRef.deref()?.getState())?.mode ?? defaultModeSlug

				cline.emit("taskSpawned", newCline.taskId)

				pushToolResult(
					`Created new task in ${mode ? (getModeBySlug(mode)?.name ?? mode) : "default"} mode. This task will be paused until the new task completes.`,
				)
			}
		} catch (error) {
			await handleError("creating new task", error)
			return
		}
	}
}

// Create and register the tool instance
export const newTaskTool = new NewTaskTool()
export default newTaskTool
