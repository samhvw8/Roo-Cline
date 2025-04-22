import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from ".."
import { ModelInfo } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { workerManager } from "../../services/workers/WorkerManager"

const TOKEN_WORKER_ID = "token-counter"
const TOKEN_WORKER_PATH = "workers/token-counter.worker.js"

/**
 * Base class for API providers that implements common functionality
 */
export abstract class BaseProvider implements ApiHandler {
	private isDestroyed: boolean = false

	/**
	 * Class destructor to ensure cleanup
	 */
	public async [Symbol.asyncDispose](): Promise<void> {
		if (!this.isDestroyed) {
			this.isDestroyed = true
			await this.cleanup()
		}
	}

	/**
	 * Cleanup resources used by the provider
	 * This method can be called explicitly or will be called automatically on destruction
	 */
	public async cleanup(): Promise<void> {
		this.isDestroyed = true
	}
	abstract createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream
	abstract getModel(): { id: string; info: ModelInfo }

	/**
	 * Default token counting implementation using tiktoken
	 * Providers can override this to use their native token counting endpoints
	 *
	 * Uses a cached Tiktoken encoder instance for performance since it's stateless.
	 * The encoder is created lazily on first use and reused for subsequent calls.
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		if (!content || content.length === 0) return 0

		const worker = await workerManager.initializeWorker(TOKEN_WORKER_ID, TOKEN_WORKER_PATH)

		return new Promise((resolve, reject) => {
			// Handle worker messages
			const messageHandler = (result: number | { error: string }) => {
				worker.removeListener("message", messageHandler)
				worker.removeListener("error", errorHandler)

				if (typeof result === "number") {
					resolve(result)
				} else {
					reject(new Error(result.error))
				}
			}

			// Handle worker errors
			const errorHandler = (error: Error) => {
				worker.removeListener("message", messageHandler)
				worker.removeListener("error", errorHandler)
				reject(error)
			}

			worker.once("message", messageHandler)
			worker.once("error", errorHandler)

			// Send content to worker
			worker.postMessage(content)
		})
	}
}
