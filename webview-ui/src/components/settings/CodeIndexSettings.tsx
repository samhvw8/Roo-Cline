import React, { useState, useEffect } from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { Database } from "lucide-react"
import { vscode } from "../../utils/vscode"
import { VSCodeCheckbox, VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"
import { ExtensionStateContextType } from "@/context/ExtensionStateContext"
import { ApiConfiguration } from "../../../../src/shared/api"
import { CodebaseIndexConfig, CodebaseIndexModels } from "../../../../src/schemas"
import { EmbedderProvider } from "../../../../src/shared/embeddingModels"
import { z } from "zod"

interface CodeIndexSettingsProps {
	codebaseIndexModels: CodebaseIndexModels | undefined
	codebaseIndexConfig: CodebaseIndexConfig | undefined
	apiConfiguration: ApiConfiguration
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
	setApiConfigurationField: <K extends keyof ApiConfiguration>(field: K, value: ApiConfiguration[K]) => void
}

interface IndexingStatusUpdateMessage {
	type: "indexingStatusUpdate"
	values: {
		systemStatus: string
		message?: string
		processedBlockCount: number
		totalBlockCount: number
	}
}

export const CodeIndexSettings: React.FC<CodeIndexSettingsProps> = ({
	codebaseIndexModels,
	codebaseIndexConfig,
	apiConfiguration,
	setCachedStateField,
	setApiConfigurationField,
}) => {
	const [indexingStatus, setIndexingStatus] = useState({
		systemStatus: "Standby",
		message: "",
		processedBlockCount: 0,
		totalBlockCount: 0,
	})

	// Safely calculate available models for current provider
	const currentProvider = codebaseIndexConfig?.codebaseIndexEmbedderProvider
	const modelsForProvider =
		currentProvider === "openai" || currentProvider === "ollama"
			? codebaseIndexModels?.[currentProvider]
			: codebaseIndexModels?.openai
	const availableModelIds = Object.keys(modelsForProvider || {})

	useEffect(() => {
		// Request initial indexing status from extension host
		vscode.postMessage({ type: "requestIndexingStatus" })

		// Set up interval for periodic status updates

		// Set up message listener for status updates
		const handleMessage = (event: MessageEvent<IndexingStatusUpdateMessage>) => {
			if (event.data.type === "indexingStatusUpdate") {
				setIndexingStatus({
					...event.data.values,
					message: event.data.values.message || "",
				})
			}
		}

		window.addEventListener("message", handleMessage)

		// Cleanup function
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [codebaseIndexConfig, codebaseIndexModels])

	function validateIndexingConfig(config: CodebaseIndexConfig | undefined, apiConfig: ApiConfiguration): boolean {
		if (!config) return false

		const baseSchema = z.object({
			codebaseIndexQdrantUrl: z.string().min(1, "Qdrant URL is required"),
			codebaseIndexEmbedderModelId: z.string().min(1, "Model ID is required"),
		})

		const providerSchemas = {
			openai: baseSchema.extend({
				codebaseIndexEmbedderProvider: z.literal("openai"),
				codeIndexOpenAiKey: z.string().min(1, "OpenAI key is required"),
			}),
			ollama: baseSchema.extend({
				codebaseIndexEmbedderProvider: z.literal("ollama"),
				codebaseIndexEmbedderBaseUrl: z.string().min(1, "Ollama URL is required"),
			}),
		}

		try {
			const schema =
				config.codebaseIndexEmbedderProvider === "openai" ? providerSchemas.openai : providerSchemas.ollama

			schema.parse({
				...config,
				codeIndexOpenAiKey: apiConfig.codeIndexOpenAiKey,
			})
			return true
		} catch {
			return false
		}
	}

	return (
		<>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Database size={16} />
					Codebase Indexing
				</div>
			</SectionHeader>
			<Section>
				<VSCodeCheckbox
					checked={codebaseIndexConfig?.codebaseIndexEnabled}
					onChange={(e: any) =>
						setCachedStateField("codebaseIndexConfig", {
							...codebaseIndexConfig,
							codebaseIndexEnabled: e.target.checked,
						})
					}>
					Enable Codebase Indexing
				</VSCodeCheckbox>

				{codebaseIndexConfig?.codebaseIndexEnabled && (
					<div className="mt-4 space-y-4">
						<div style={{ fontWeight: "normal", marginBottom: "4px" }}>Embeddings Provider</div>
						<div className="flex items-center gap-2">
							<Select
								value={codebaseIndexConfig?.codebaseIndexEmbedderProvider || "openai"}
								onValueChange={(value) => {
									const newProvider = value as EmbedderProvider
									const models = codebaseIndexModels?.[newProvider]
									const modelIds = models ? Object.keys(models) : []
									const defaultModelId = modelIds.length > 0 ? modelIds[0] : "" // Use empty string if no models

									if (codebaseIndexConfig) {
										setCachedStateField("codebaseIndexConfig", {
											...codebaseIndexConfig,
											codebaseIndexEmbedderProvider: newProvider,
											codebaseIndexEmbedderModelId: defaultModelId,
										})
									}
								}}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="openai">OpenAI</SelectItem>
									<SelectItem value="ollama">Ollama</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div style={{ fontWeight: "normal", marginBottom: "4px" }}>Model:</div>
						{codebaseIndexConfig?.codebaseIndexEmbedderProvider === "openai" && (
							<div className="space-y-2">
								<VSCodeTextField
									type="password"
									value={apiConfiguration.codeIndexOpenAiKey || ""}
									onInput={(e: any) => setApiConfigurationField("codeIndexOpenAiKey", e.target.value)}
									style={{ width: "100%" }}>
									OpenAI Key:
								</VSCodeTextField>
							</div>
						)}

						<div className="flex items-center gap-2">
							<Select
								value={codebaseIndexConfig?.codebaseIndexEmbedderModelId || ""}
								onValueChange={(value) =>
									setCachedStateField("codebaseIndexConfig", {
										...codebaseIndexConfig,
										codebaseIndexEmbedderModelId: value,
									})
								}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									{availableModelIds.map((modelId) => (
										<SelectItem key={modelId} value={modelId}>
											{modelId}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{codebaseIndexConfig?.codebaseIndexEmbedderProvider === "ollama" && (
							<>
								<div className="space-y-2">
									<VSCodeTextField
										value={codebaseIndexConfig.codebaseIndexEmbedderBaseUrl || ""}
										onInput={(e: any) =>
											setCachedStateField("codebaseIndexConfig", {
												...codebaseIndexConfig,
												codebaseIndexEmbedderBaseUrl: e.target.value,
											})
										}
										style={{ width: "100%" }}>
										Ollama URL:
									</VSCodeTextField>
								</div>
							</>
						)}

						<div className="space-y-2">
							<VSCodeTextField
								value={codebaseIndexConfig.codebaseIndexQdrantUrl}
								onInput={(e: any) =>
									setCachedStateField("codebaseIndexConfig", {
										...codebaseIndexConfig,
										codebaseIndexQdrantUrl: e.target.value,
									})
								}
								style={{ width: "100%" }}>
								Qdrant URL
							</VSCodeTextField>
						</div>

						<div className="space-y-2">
							<VSCodeTextField
								type="password"
								value={apiConfiguration.codeIndexQdrantApiKey}
								onInput={(e: any) => setApiConfigurationField("codeIndexQdrantApiKey", e.target.value)}
								style={{ width: "100%" }}>
								Qdrant Key:
							</VSCodeTextField>
						</div>

						<div className="text-sm text-vscode-descriptionForeground mt-4">
							<span
								className={`
									inline-block w-3 h-3 rounded-full mr-2
									${
										indexingStatus.systemStatus === "Standby"
											? "bg-gray-400"
											: indexingStatus.systemStatus === "Indexing"
												? "bg-yellow-500 animate-pulse"
												: indexingStatus.systemStatus === "Indexed"
													? "bg-green-500"
													: indexingStatus.systemStatus === "Error"
														? "bg-red-500"
														: "bg-gray-400"
									}
								`}></span>
							{indexingStatus.systemStatus}
							{indexingStatus.systemStatus !== "Indexing" && indexingStatus.message
								? ` - ${indexingStatus.message}`
								: ""}
						</div>

						{indexingStatus.systemStatus === "Indexing" && (
							<div className="mt-4 space-y-1">
								<p className="text-sm text-muted-foreground">
									{indexingStatus.message || "Indexing in progress..."}
								</p>
								<ProgressPrimitive.Root
									className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
									value={
										indexingStatus.totalBlockCount > 0
											? (indexingStatus.processedBlockCount / indexingStatus.totalBlockCount) *
												100
											: indexingStatus.totalBlockCount === 0 &&
												  indexingStatus.processedBlockCount === 0
												? 100
												: 0
									}>
									<ProgressPrimitive.Indicator
										className="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-in-out"
										style={{
											transform: `translateX(-${
												100 -
												(indexingStatus.totalBlockCount > 0
													? (indexingStatus.processedBlockCount /
															indexingStatus.totalBlockCount) *
														100
													: indexingStatus.totalBlockCount === 0 &&
														  indexingStatus.processedBlockCount === 0
														? 100
														: 0)
											}%)`,
										}}
									/>
								</ProgressPrimitive.Root>
							</div>
						)}

						<div className="flex gap-2 mt-4">
							<VSCodeButton
								onClick={() => vscode.postMessage({ type: "startIndexing" })}
								disabled={
									indexingStatus.systemStatus === "Indexing" ||
									!validateIndexingConfig(codebaseIndexConfig, apiConfiguration)
								}>
								Start Indexing
							</VSCodeButton>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<VSCodeButton appearance="secondary">Clear Index Data</VSCodeButton>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Are you sure?</AlertDialogTitle>
										<AlertDialogDescription>
											This action cannot be undone. This will permanently delete your codebase
											index data.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => vscode.postMessage({ type: "clearIndexData" })}>
											Clear Data
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				)}
			</Section>
		</>
	)
}
