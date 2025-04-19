import { Cline } from "../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag, ToolParamName } from "../../shared/tools"
import { ToolRegistry } from "./ToolRegistry"
import { formatResponse } from "../prompts/responses"
import { ToolName } from "../../schemas"

export interface ToolHandlerCallbacks {
	askApproval: AskApproval
	handleError: HandleError
	pushToolResult: PushToolResult
	removeClosingTag: RemoveClosingTag
}

export abstract class BaseTool {
	abstract name: ToolName
	abstract description: string
	abstract handler(context: Cline, block: ToolUse, callbacks: ToolHandlerCallbacks): Promise<void>

	// Get a human-readable description of what the tool is doing with its current parameters
	getDescription(block: ToolUse): string {
		return `[${this.name}]`
	}

	constructor(autoRegister = true) {
		if (autoRegister) {
			this.register()
		}
	}

	register(): this {
		ToolRegistry.getInstance().registerTool(this)
		return this
	}

	// Common parameter validation
	protected async validateRequiredParam(
		cline: Cline,
		paramName: ToolParamName,
		paramValue: any,
		callbacks: ToolHandlerCallbacks,
	): Promise<boolean> {
		if (!paramValue) {
			cline.consecutiveMistakeCount++
			cline.recordToolError(this.name)
			callbacks.pushToolResult(await cline.sayAndCreateMissingParamError(this.name, paramName))
			return false
		}
		return true
	}

	// Handle partial tool execution
	protected async handlePartialExecution(
		cline: Cline,
		block: ToolUse,
		params: Partial<Record<ToolParamName, any>>,
		callbacks: ToolHandlerCallbacks,
	): Promise<void> {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: this.name,
				...Object.fromEntries(
					Object.entries(params).map(([key, value]) => [
						key,
						callbacks.removeClosingTag(key as ToolParamName, value),
					]),
				),
			})
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}
	}

	// Reset consecutive mistakes counter
	protected resetMistakeCount(cline: Cline): void {
		cline.consecutiveMistakeCount = 0
	}

	// Handle tool approval
	protected async handleToolApproval(cline: Cline, message: any, callbacks: ToolHandlerCallbacks): Promise<boolean> {
		const completeMessage = JSON.stringify(message)
		return await callbacks.askApproval("tool", completeMessage)
	}

	// Format tool error
	protected formatToolError(message: string): string {
		return formatResponse.toolError(message)
	}

	// Handle tool error
	protected async handleToolError(
		cline: Cline,
		error: any,
		callbacks: ToolHandlerCallbacks,
		context: string,
	): Promise<void> {
		cline.recordToolError(this.name as ToolName)
		await callbacks.handleError(context, error)
	}
}
