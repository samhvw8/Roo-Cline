import { ToolRegistry } from "../ToolRegistry"
import { BaseTool } from "../BaseTool"
import { Cline } from "../../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../../shared/tools"
import { ToolName } from "../../../schemas"

class MockTool extends BaseTool {
	name: ToolName = "read_file"
	description = "Mock tool for testing"
	async handler(
		context: Cline,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void> {
		// Mock implementation
	}
}

class MockTool2 extends BaseTool {
	name: ToolName = "write_to_file"
	description = "Second mock tool for testing"
	async handler(
		context: Cline,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void> {
		// Mock implementation
	}
}

describe("ToolRegistry", () => {
	let registry: ToolRegistry

	beforeEach(() => {
		registry = ToolRegistry.getInstance()
		registry.clearRegistry()
	})

	it("should maintain a singleton instance", () => {
		const instance1 = ToolRegistry.getInstance()
		const instance2 = ToolRegistry.getInstance()
		expect(instance1).toBe(instance2)
	})

	it("should register and retrieve tools", () => {
		const mockTool = new MockTool()
		registry.registerTool(mockTool)

		const retrievedTool = registry.getTool("read_file")
		expect(retrievedTool).toBe(mockTool)
	})

	it("should return undefined for non-existent tools", () => {
		const tool = registry.getTool("execute_command")
		expect(tool).toBeUndefined()
	})

	it("should get tool description", () => {
		const mockTool = new MockTool()
		registry.registerTool(mockTool)

		const description = registry.getToolDescription("read_file")
		expect(description).toBe("Mock tool for testing")
	})

	it("should return empty string for non-existent tool description", () => {
		const description = registry.getToolDescription("execute_command")
		expect(description).toBe("")
	})

	it("should execute tool handler", async () => {
		const mockTool = new MockTool()
		const handlerSpy = jest.spyOn(mockTool, "handler")
		registry.registerTool(mockTool)

		const context = {} as Cline
		const block = {
			type: "tool_use",
			name: "read_file",
			params: { path: "test.txt" },
			partial: false,
		} as ToolUse

		const mockApproval = jest.fn()
		const mockError = jest.fn()
		const mockPushResult = jest.fn()
		const mockRemoveTag = jest.fn()

		await registry.executeToolHandler(
			"read_file",
			context,
			block,
			mockApproval,
			mockError,
			mockPushResult,
			mockRemoveTag,
		)
		expect(handlerSpy).toHaveBeenCalledWith(context, block, mockApproval, mockError, mockPushResult, mockRemoveTag)
	})

	it("should throw error when executing non-existent tool", async () => {
		const context = {} as Cline
		const block = {
			type: "tool_use",
			name: "execute_command",
			params: { command: "test" },
			partial: false,
		} as ToolUse

		const mockApproval = jest.fn()
		const mockError = jest.fn()
		const mockPushResult = jest.fn()
		const mockRemoveTag = jest.fn()

		await expect(
			registry.executeToolHandler(
				"execute_command",
				context,
				block,
				mockApproval,
				mockError,
				mockPushResult,
				mockRemoveTag,
			),
		).rejects.toThrow("Tool execute_command not found")
	})

	it("should get all registered tools", () => {
		const mockTool1 = new MockTool()
		const mockTool2 = new MockTool2()

		registry.registerTool(mockTool1)
		registry.registerTool(mockTool2)

		const allTools = registry.getAllTools()
		expect(allTools.size).toBe(2)
		expect(allTools.get("read_file")).toBe(mockTool1)
		expect(allTools.get("write_to_file")).toBe(mockTool2)
	})

	it("should clear registry", () => {
		const mockTool = new MockTool()
		registry.registerTool(mockTool)

		registry.clearRegistry()
		expect(registry.getAllTools().size).toBe(0)
	})
})
