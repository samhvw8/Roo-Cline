import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

// TODO: Update imports for Chutes once defined in shared/api.ts
import { ApiHandlerOptions, ChutesModelId, chutesDefaultModelId, chutesModels } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import { SingleCompletionHandler } from "../index"
import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"

// Assuming a default temperature, adjust if needed based on Chutes documentation if found
const CHUTES_DEFAULT_TEMPERATURE = 0.5

// Handler for Chutes AI (OpenAI compatible)
export class ChutesHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: "https://llm.chutes.ai/v1", // Chutes AI endpoint
			apiKey: this.options.chutesApiKey ?? "not-provided", // Use chutesApiKey
			defaultHeaders: DEFAULT_HEADERS,
		})
	}

	override getModel() {
		// Logic for Chutes models (using placeholders for now)
		// Determine which model ID to use (specified or default)
		const id =
			this.options.apiModelId && this.options.apiModelId in chutesModels
				? (this.options.apiModelId as ChutesModelId)
				: chutesDefaultModelId

		// Chutes is OpenAI compatible, likely no reasoning effort
		return {
			id,
			info: chutesModels[id],
		}
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const { id: modelId, info: modelInfo } = this.getModel()

		// Use the OpenAI-compatible API.
		const stream = await this.client.chat.completions.create({
			model: modelId,
			max_tokens: modelInfo.maxTokens, // Assuming standard max_tokens parameter
			temperature: this.options.modelTemperature ?? CHUTES_DEFAULT_TEMPERATURE,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true }, // Assuming standard include_usage support
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				// Assuming standard OpenAI usage fields
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
					cacheReadTokens: 0, // Assuming 0 for Chutes
					cacheWriteTokens: 0, // Assuming 0 for Chutes
				}
			}
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel()

		try {
			const response = await this.client.chat.completions.create({
				model: modelId,
				messages: [{ role: "user", content: prompt }],
			})

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Chutes AI completion error: ${error.message}`)
			}

			throw error
		}
	}
}