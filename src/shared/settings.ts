import { GlobalState } from "../schemas"
import { AssertEqual, Equals, Keys, Values } from "../utils/type-fu"

export const SETTING_IDS = {
  READ_ONLY: "readOnly",
  READ_ONLY_OUTSIDE_WORKSPACE: "readOnlyOutsideWorkspace",
  WRITE: "write",
  WRITE_OUTSIDE_WORKSPACE: "writeOutsideWorkspace",
  EXECUTE: "execute",
  BROWSER: "browser",
  MCP: "mcp",
  MODE_SWITCH: "modeSwitch",
  SUBTASKS: "subtasks",
} as const

export type SettingId = Values<typeof SETTING_IDS>

type _AssertSettingIds = AssertEqual<Equals<SettingId, Values<typeof SETTING_IDS>>>

type SettingKey = Keys<typeof SETTING_IDS>

interface SettingConfig {
  enabled: boolean
  default: boolean
}

export const settingConfigsMap: Record<SettingKey, SettingConfig> = {
  READ_ONLY: { enabled: false, default: false },
  READ_ONLY_OUTSIDE_WORKSPACE: { enabled: false, default: false },
  WRITE: { enabled: false, default: false },
  WRITE_OUTSIDE_WORKSPACE: { enabled: false, default: false },
  EXECUTE: { enabled: false, default: false },
  BROWSER: { enabled: false, default: false },
  MCP: { enabled: false, default: false },
  MODE_SWITCH: { enabled: false, default: false },
  SUBTASKS: { enabled: false, default: false },
}

export const settingDefault = Object.fromEntries(
  Object.entries(settingConfigsMap).map(([_, config]) => [
    SETTING_IDS[_ as keyof typeof SETTING_IDS] as SettingId,
    config.default,
  ]),
) as Record<SettingId, boolean>

export const settings = {
  get: (id: SettingKey): SettingConfig | undefined => settingConfigsMap[id],
  isEnabled: (settingsConfig: Record<SettingId, boolean>, id: SettingId) =>
    settingsConfig[id] ?? settingDefault[id],
} as const