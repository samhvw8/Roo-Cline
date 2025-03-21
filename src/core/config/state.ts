import { TERMINAL_SHELL_INTEGRATION_TIMEOUT } from "../../integrations/terminal/Terminal"
import { defaultModeSlug } from "../../shared/modes"
import { formatLanguage } from "../../shared/language"
import { experimentDefault } from "../../shared/experiments"
import { TelemetrySetting } from "../../shared/TelemetrySetting"
import { GlobalStateKey } from "../../shared/globalState"

/**
 * State value types
 */
type StateValueType =
	| string
	| number
	| boolean
	| undefined
	| null
	| { [key: string]: StateValueType }
	| StateValueType[]

type StateTransformer<T> = (value: T) => T

/**
 * State definition interface
 */
interface StateDefinition<T = StateValueType> {
	defaultValue: T
	type: string
	description?: string
	validate?: (value: unknown) => boolean
	transform?: StateTransformer<T>
	persist?: boolean
}

/**
 * State validation error
 */
class StateValidationError extends Error {
	constructor(key: GlobalStateKey, value: unknown) {
		super(`Invalid value for state key "${key}": ${value}`)
	}
}

/**
 * State definition system
 */
class StateDefiner {
	private definitions = new Map<GlobalStateKey, StateDefinition>()

	/**
	 * Define a new state property
	 */
	define<T extends StateValueType>(key: GlobalStateKey, definition: StateDefinition<T>): this {
		this.definitions.set(key, {
			...definition,
			persist: definition.persist ?? true, // Default to true for backward compatibility
		})
		return this
	}

	/**
	 * Get value
	 */
	getValue<T extends StateValueType>(key: GlobalStateKey, context?: vscode.ExtensionContext): T | undefined {
		try {
			const def = this.definitions.get(key)
			if (!def) {
				throw new Error(`State key "${key}" not defined`)
			}

			if (context && def.persist) {
				const value = context.globalState.get(key)
				if (value !== undefined) {
					return value as T
				}
			}

			return def.defaultValue as T
		} catch (error) {
			console.error(`Error getting value for ${key}:`, error)
			return undefined
		}
	}

	/**
	 * Set value with validation, transformation and persistence
	 */
	async setValue<T extends StateValueType>(
		key: GlobalStateKey,
		value: T,
		context?: vscode.ExtensionContext,
	): Promise<void> {
		try {
			const def = this.definitions.get(key)
			if (!def) {
				throw new Error(`State key "${key}" not defined`)
			}

			// Validate
			this.validate(key, value)

			// Transform
			let transformedValue = value
			if (def.transform) {
				transformedValue = def.transform(value)
			}

			// Persist if enabled and context available
			if (def.persist && context) {
				await context.globalState.update(key, transformedValue)
			}
		} catch (error) {
			console.error(`Error setting value for ${key}:`, error)
			throw error
		}
	}

	/**
	 * Get default value
	 */
	getDefaultValue<T extends StateValueType>(key: GlobalStateKey): T | undefined {
		return this.definitions.get(key)?.defaultValue as T
	}

	/**
	 * Validate value
	 */
	validate(key: GlobalStateKey, value: unknown): boolean {
		const def = this.definitions.get(key)
		if (!def?.validate) return true
		if (!def.validate(value)) {
			throw new StateValidationError(key, value)
		}
		return true
	}

	/**
	 * Create state with defaults
	 */
	createState<T extends Partial<Record<GlobalStateKey, StateValueType>>>(
		values: T,
	): T & Record<GlobalStateKey, StateValueType> {
		const result = { ...values } as Record<GlobalStateKey, StateValueType>

		for (const [key, def] of this.definitions) {
			if (!(key in result)) {
				result[key] = def.defaultValue
			}
		}

		return result as T & Record<GlobalStateKey, StateValueType>
	}
}

// Create state instance
export const state = new StateDefiner()

// Define state
state
	.define("mode", {
		defaultValue: defaultModeSlug,
		type: "string",
		description: "Current mode",
	})
	.define("language", {
		defaultValue: formatLanguage(
			process.env.VSCODE_NLS_CONFIG ? JSON.parse(process.env.VSCODE_NLS_CONFIG).locale : "en",
		),
		type: "string",
		description: "Interface language",
	})
	.define("telemetrySetting", {
		defaultValue: "unset" as TelemetrySetting,
		type: "string",
		validate: (value) => ["enabled", "disabled", "unset"].includes(value as string),
	})
	.define("alwaysAllowReadOnly", {
		defaultValue: false,
		type: "boolean",
		description: "Allow read-only operations without confirmation",
	})
	.define("alwaysAllowWrite", {
		defaultValue: false,
		type: "boolean",
		description: "Allow write operations without confirmation",
	})
	.define("alwaysAllowExecute", {
		defaultValue: false,
		type: "boolean",
		description: "Allow execute operations without confirmation",
	})
	.define("alwaysAllowBrowser", {
		defaultValue: false,
		type: "boolean",
		description: "Allow browser operations without confirmation",
	})
	.define("alwaysAllowMcp", {
		defaultValue: false,
		type: "boolean",
		description: "Allow MCP operations without confirmation",
	})
	.define("alwaysAllowModeSwitch", {
		defaultValue: false,
		type: "boolean",
		description: "Allow mode switching without confirmation",
	})
	.define("alwaysAllowSubtasks", {
		defaultValue: false,
		type: "boolean",
		description: "Allow subtasks without confirmation",
	})
	.define("browserViewportSize", {
		defaultValue: "900x600",
		type: "string",
		validate: (value) => /^\d+x\d+$/.test(value as string),
	})
	.define("screenshotQuality", {
		defaultValue: 75,
		type: "number",
		validate: (value) => typeof value === "number" && value >= 0 && value <= 100,
	})
	.define("remoteBrowserEnabled", {
		defaultValue: false,
		type: "boolean",
		description: "Enable remote browser connection",
	})
	.define("remoteBrowserHost", {
		defaultValue: undefined,
		type: "string",
		description: "Remote browser host URL",
	})
	.define("terminalOutputLineLimit", {
		defaultValue: 500,
		type: "number",
		validate: (value) => typeof value === "number" && value > 0,
	})
	.define("terminalShellIntegrationTimeout", {
		defaultValue: TERMINAL_SHELL_INTEGRATION_TIMEOUT,
		type: "number",
	})
	.define("writeDelayMs", {
		defaultValue: 1000,
		type: "number",
		description: "Delay between write operations",
	})
	.define("soundEnabled", {
		defaultValue: false,
		type: "boolean",
		description: "Enable sound effects",
	})
	.define("soundVolume", {
		defaultValue: 0.5,
		type: "number",
		validate: (value) => typeof value === "number" && value >= 0 && value <= 1,
	})
	.define("ttsEnabled", {
		defaultValue: false,
		type: "boolean",
		description: "Enable text-to-speech",
	})
	.define("ttsSpeed", {
		defaultValue: 1.0,
		type: "number",
		validate: (value) => typeof value === "number" && value > 0,
	})
	.define("diffEnabled", {
		defaultValue: true,
		type: "boolean",
		description: "Enable diff view for changes",
	})
	.define("enableCheckpoints", {
		defaultValue: true,
		type: "boolean",
		description: "Enable checkpoints feature",
	})
	.define("checkpointStorage", {
		defaultValue: "task" as const,
		type: "string",
		validate: (value) => value === "task",
	})
	.define("mcpEnabled", {
		defaultValue: true,
		type: "boolean",
		description: "Enable Model Context Protocol",
	})
	.define("enableMcpServerCreation", {
		defaultValue: true,
		type: "boolean",
		description: "Allow creation of new MCP servers",
	})
	.define("autoApprovalEnabled", {
		defaultValue: false,
		type: "boolean",
		description: "Enable automatic approval of operations",
	})
	.define("showRooIgnoredFiles", {
		defaultValue: true,
		type: "boolean",
		description: "Show files ignored by .rooignore",
	})
	.define("maxOpenTabsContext", {
		defaultValue: 20,
		type: "number",
		validate: (value) => typeof value === "number" && value > 0,
	})
	.define("maxWorkspaceFiles", {
		defaultValue: 200,
		type: "number",
		validate: (value) => typeof value === "number" && value > 0,
	})
	.define("maxReadFileLine", {
		defaultValue: 500,
		type: "number",
		validate: (value) => typeof value === "number" && value > 0,
	})

// Export types
export type { StateDefinition, StateValueType }
