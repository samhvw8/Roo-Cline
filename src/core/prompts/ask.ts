import { Mode, askMode, defaultPrompts, PromptComponent } from "../../shared/modes"
import { getToolDescriptionsForMode } from "./tools"
import {
    getRulesSection,
    getSystemInfoSection,
    getObjectiveSection,
    getSharedToolUseSection,
    getMcpServersSection,
    getToolUseGuidelinesSection,
    getCapabilitiesSection
} from "./sections"
import { DiffStrategy } from "../diff/DiffStrategy"
import { McpHub } from "../../services/mcp/McpHub"
import { ExpToolName } from "../tool-lists"

export const mode = askMode

export const ASK_PROMPT = async (
    cwd: string,
    supportsComputerUse: boolean,
    mcpHub?: McpHub,
    diffStrategy?: DiffStrategy,
    browserViewportSize?: string,
    customPrompt?: PromptComponent,
    expToolUse?: Record<ExpToolName, boolean>
) => `${customPrompt?.roleDefinition || defaultPrompts[askMode].roleDefinition}

${getSharedToolUseSection()}

${getToolDescriptionsForMode(mode, cwd, supportsComputerUse, diffStrategy, browserViewportSize, mcpHub)}

${getToolUseGuidelinesSection()}

${await getMcpServersSection(mcpHub, diffStrategy)}

${getCapabilitiesSection(cwd, supportsComputerUse, mcpHub, diffStrategy)}

${getRulesSection(cwd, supportsComputerUse, diffStrategy, expToolUse)}

${getSystemInfoSection(cwd)}

${getObjectiveSection()}`
