import { BaseTool } from "./BaseTool"
import { Cline } from "../Cline"
import {
	ToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolParamName,
	ToolResponse,
} from "../../shared/tools"
import { ClineAsk, ToolName, ToolProgressStatus } from "../../schemas"

export class ToolRegistry {
	private static instance: ToolRegistry
	private tools: Map<ToolName, BaseTool> = new Map()

	private constructor() {}

	static getInstance(): ToolRegistry {
		if (!ToolRegistry.instance) {
			ToolRegistry.instance = new ToolRegistry()
		}
		return ToolRegistry.instance
	}

	registerTool(tool: BaseTool) {
		this.tools.set(tool.name as ToolName, tool)
	}

	getTool(name: ToolName): BaseTool | undefined {
		return this.tools.get(name)
	}

	getToolDescription(name: ToolName): string {
		const tool = this.tools.get(name)
		return tool ? tool.description : ""
	}

	async executeToolHandler(
		name: string,
		context: Cline,
		block: ToolUse,
		askApproval: (type: ClineAsk, partialMessage?: string, progressStatus?: ToolProgressStatus) => Promise<boolean>,
		handleError: (action: string, error: Error) => Promise<void>,
		pushToolResult: (content: ToolResponse) => void,
		removeClosingTag: (tag: ToolParamName, text?: string) => string,
		toolDescription: () => string,
		askFinishSubTaskApproval: () => Promise<boolean>,
	): Promise<void> {
		const tool = this.tools.get(name as ToolName)
		if (!tool) {
			throw new Error(`Tool ${name} not found`)
		}
		const callbacks = {
			askApproval,
			handleError,
			pushToolResult,
			removeClosingTag,
			toolDescription,
			askFinishSubTaskApproval
		}
		return tool.handler(context, block, callbacks)
	}

	getAllTools(): Map<ToolName, BaseTool> {
		return new Map(this.tools)
	}

	clearRegistry() {
		this.tools.clear()
	}
}
