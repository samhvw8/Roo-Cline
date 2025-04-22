import { parentPort } from "worker_threads"
import { Tiktoken } from "js-tiktoken/lite"
import cl100kBase from "js-tiktoken/ranks/cl100k_base"
import { Anthropic } from "@anthropic-ai/sdk"

// Reuse the fudge factor used in the original code
const TOKEN_FUDGE_FACTOR = 1.5

type ContentBlock = Anthropic.Messages.ContentBlockParam

// Initialize encoder once for reuse
let encoder: Tiktoken | null = null

parentPort?.on("message", async (content: Array<ContentBlock>) => {
	try {
		if (!content || content.length === 0) {
			parentPort?.postMessage(0)
			return
		}

		let totalTokens = 0

		// Lazily create encoder if it doesn't exist
		if (!encoder) {
			// Use cl100k_base encoding which is used by Claude models
			encoder = new Tiktoken(cl100kBase)
		}

		// Process each content block
		for (const block of content) {
			if (block.type === "text") {
				const text = block.text || ""
				if (text.length > 0) {
					const tokens = encoder.encode(text)
					totalTokens += tokens.length
				}
			} else if (block.type === "image") {
				const imageSource = block.source
				if (imageSource && typeof imageSource === "object" && "data" in imageSource) {
					const base64Data = imageSource.data as string
					totalTokens += Math.ceil(Math.sqrt(base64Data.length))
				} else {
					totalTokens += 300 // Conservative estimate for unknown images
				}
			}
		}

		// Apply fudge factor and send result
		parentPort?.postMessage(Math.ceil(totalTokens * TOKEN_FUDGE_FACTOR))
	} catch (error) {
		parentPort?.postMessage({ error: error instanceof Error ? error.message : "Unknown error" })
	}
})
