import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { ApiHandlerOptions, GroqModelId, groqDefaultModelId, groqModels } from "../../shared/api" // Updated imports for Groq
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import { SingleCompletionHandler } from "../index"
import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"

const GROQ_DEFAULT_TEMPERATURE = 0.5 // Adjusted default temperature for Groq (common default)

// Renamed class to GroqHandler
export class GroqHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.client = new OpenAI({
			baseURL: "https://api.groq.com/openai/v1", // Using Groq base URL
			apiKey: this.options.groqApiKey ?? "not-provided", // Using groqApiKey
			defaultHeaders: DEFAULT_HEADERS,
		})
	}

	override getModel() {
		// Updated logic for Groq models
		// Determine which model ID to use (specified or default)
		const id =
			this.options.apiModelId && this.options.apiModelId in groqModels // Use groqModels
				? (this.options.apiModelId as GroqModelId) // Use GroqModelId
				: groqDefaultModelId // Use groqDefaultModelId

		// Groq does not support reasoning effort
		return {
			id,
			info: groqModels[id], // Use groqModels
		}
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const { id: modelId, info: modelInfo } = this.getModel() // TODO: Remove reasoningEffort from destructuring

		// Use the OpenAI-compatible API.
		const stream = await this.client.chat.completions.create({
			model: modelId,
			max_tokens: modelInfo.maxTokens, // Assuming Groq uses max_tokens
			temperature: this.options.modelTemperature ?? GROQ_DEFAULT_TEMPERATURE,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true }, // Assuming Groq supports include_usage
			// Removed reasoning logic
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			// Removed reasoning content handling

			if (chunk.usage) {
				// Assuming Groq usage fields match OpenAI standard
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
					// Assuming Groq doesn't provide cache tokens currently
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				}
			}
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel() // Removed reasoningEffort

		try {
			const response = await this.client.chat.completions.create({
				model: modelId,
				messages: [{ role: "user", content: prompt }],
				// Removed reasoning logic
			})

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				// Updated error message prefix
				throw new Error(`Groq completion error: ${error.message}`)
			}

			throw error
		}
	}
}