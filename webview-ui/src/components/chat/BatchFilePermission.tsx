import { memo, useState, useEffect, useCallback } from "react"
import { CheckCircle } from "lucide-react"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { ToolUseBlock, ToolUseBlockHeader } from "../common/ToolUseBlock"
import { Checkbox } from "../ui/checkbox"
import { Button } from "../ui/button"
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
	const [individualPermissions, setIndividualPermissions] = useState<{ [key: string]: boolean }>({})
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Initialize permissions as true when files change
	useEffect(() => {
		const initialPermissions: { [key: string]: boolean } = {}
		files.forEach((file) => {
			initialPermissions[file.path] = true
		})
		setIndividualPermissions(initialPermissions)
		setIsSubmitting(false)
	}, [files, ts])

	const handleIndividualPermission = useCallback((filePath: string, checked: boolean) => {
		setIndividualPermissions((prev) => ({
			...prev,
			[filePath]: checked,
		}))
	}, [])

	const handleSubmitIndividual = useCallback(() => {
		setIsSubmitting(true)
		const response: { [key: string]: boolean } = {}
		files.forEach((file) => {
			response[file.key] = individualPermissions[file.path] ?? true
		})
		onPermissionResponse?.(response)
	}, [files, individualPermissions, onPermissionResponse])

	// Don't render if there are no files or no response handler
	if (!files?.length || !onPermissionResponse) {
		return null
	}

	// Check if all files are checked or all are unchecked
	const checkedCount = Object.values(individualPermissions).filter((v) => v === true).length
	const allChecked = checkedCount === files.length
	const allUnchecked = checkedCount === 0
	const showSubmitButton = !allChecked && !allUnchecked

	return (
		<div style={{ paddingTop: 5 }}>
			{/* Individual files */}
			<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
				{files.map((file) => {
					return (
						<div key={`${file.path}-${ts}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<Checkbox
								checked={individualPermissions[file.path] !== false}
								onCheckedChange={(checked) => handleIndividualPermission(file.path, checked as boolean)}
								variant="description"
							/>
							<ToolUseBlock style={{ flex: 1 }}>
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

			{/* Submit button - only show when there's a mix of checked/unchecked */}
			{showSubmitButton && (
				<div style={{ marginTop: 12 }}>
					<Button
						variant="default"
						size="default"
						style={{ width: "100%" }}
						onClick={handleSubmitIndividual}
						disabled={isSubmitting}>
						<CheckCircle className="w-4 h-4" />
						{t("chat:batchFilePermission.approveSelected")}
					</Button>
				</div>
			)}
		</div>
	)
})

BatchFilePermission.displayName = "BatchFilePermission"
