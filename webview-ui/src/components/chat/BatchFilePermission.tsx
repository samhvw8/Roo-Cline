import { memo } from "react"
import { FileCode } from "lucide-react"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import { vscode } from "@src/utils/vscode"
import { removeLeadingNonAlphanumeric } from "@src/utils/removeLeadingNonAlphanumeric"

interface FilePermissionItem {
	path: string
	lineSnippet?: string
	isOutsideWorkspace?: boolean
	key: string
	content?: string // full path
}

interface BatchFilePermissionProps {
	files: FilePermissionItem[]
	onPermissionResponse?: (response: { [key: string]: boolean }) => void
	ts: number
}

export const BatchFilePermission = memo(({ files = [], onPermissionResponse, ts }: BatchFilePermissionProps) => {
	const { t } = useAppTranslation()

	// Don't render if there are no files or no response handler
	if (!files?.length || !onPermissionResponse) {
		return null
	}

	const headerStyle = {
		display: "flex",
		alignItems: "center",
		fontSize: "13px",
		marginBottom: 5,
		gap: 8,
		opacity: 0.8,
	}

	const toolIcon = (type: string) => {
		const size = 15
		const color = "var(--vscode-foreground)"
		switch (type) {
			case "file-code":
				return <FileCode size={size} color={color} />
			default:
				return null
		}
	}

	return (
		<div style={{ paddingTop: 5 }}>
			{/* Individual files */}
			<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
				{files.map((file, index) => {
					return (
						<div key={`${file.path}-${ts}`}>
							<ToolUseBlock>
								<ToolUseBlockHeader
									onClick={() => vscode.postMessage({ type: "openFile", text: file.content })}>
									{file.path?.startsWith(".") && <span>.</span>}
									<span className="whitespace-nowrap overflow-hidden text-ellipsis text-left mr-2 rtl">
										{removeLeadingNonAlphanumeric(file.path ?? "") + "\u200E"}
										{file.lineSnippet && ` (${file.lineSnippet})`}
									</span>
									<div style={{ flexGrow: 1 }}></div>
									<span
										className={`codicon codicon-link-external`}
										style={{ fontSize: 13.5, margin: "1px 0" }}
									/>
								</ToolUseBlockHeader>
							</ToolUseBlock>
						</div>
					)
				})}
			</div>

		</div>
	)
})

BatchFilePermission.displayName = "BatchFilePermission"
