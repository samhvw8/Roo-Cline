import PartialXMLStreamParser from "partial-xml-stream-parser"
import { ToolParamName, toolParamNames } from "../../shared/tools"
import { toolNames, ToolName } from "../../schemas"
// Re-using the type definition from the original parseAssistantMessage file
import { AssistantMessageContent } from "./parseAssistantMessage"

export function parseAssistantMessageV3(assistantMessage: string): AssistantMessageContent[] {
	const textNodeNameKey = "#text"
	const attributeNamePrefixKey = "@"
	const parser = new PartialXMLStreamParser({
		textNodeName: textNodeNameKey,
		attributeNamePrefix: attributeNamePrefixKey,
		alwaysCreateTextNode: true, // Default and crucial for '#text' handling
		parsePrimitives: false, // Default, params are expected as strings
		stopNodes: [
			"thinking",
			"execute_command.command",
			"search_files.regex",
			"apply_diff.diff",
			"insert_content.content",
			"write_to_file.content",
			"search_files.content",
			"attempt_completion.result",
		],
		allowedRootNodes: ["thinking", ...toolNames],
	})

	const contentBlocks: AssistantMessageContent[] = []

	// Process the whole message in one go, then signal end of stream
	parser.parseStream(assistantMessage)
	const result = parser.parseStream(null)

	if (result && result.xml) {
		for (const item of result.xml) {
			if (typeof item === "string") {
				// Plain text content
				contentBlocks.push({
					type: "text",
					content: item, // Will be trimmed in the final map/filter stage
					partial: false,
				})
			} else if (typeof item === "object" && item !== null) {
				// This should be a tool call object, e.g., { "read_file": { ... } }
				const toolName = Object.keys(item)[0] as ToolName

				if (toolNames.includes(toolName)) {
					const toolData = item[toolName]
					const params: { [key in ToolParamName]?: string } = {}

					if (typeof toolData === "object" && toolData !== null) {
						for (const paramKey in toolData) {
							if (toolParamNames.includes(paramKey as ToolParamName)) {
								const paramValueContainer = toolData[paramKey]
								let paramValue = "" // Default to empty string

								if (typeof paramValueContainer === "object" && paramValueContainer !== null) {
									const textVal = paramValueContainer["#text"]
									if (textVal !== undefined && textVal !== null) {
										paramValue = String(textVal)
									}
								} else if (paramValueContainer !== undefined && paramValueContainer !== null) {
									// Handles cases where the value might not be in an object with #text
									// e.g., if parsePrimitives were true, or library simplifies empty tags.
									paramValue = String(paramValueContainer)
								}
								params[paramKey as ToolParamName] = paramValue // Will be trimmed later
							}
						}
					}

					contentBlocks.push({
						type: "tool_use",
						name: toolName,
						params: params as { [key in ToolParamName]: string }, // Cast after filling
						partial: false, // All tools are considered complete by this parser when stream ends with null
					})
				} else {
					// Unknown tag, reconstruct its string representation
					const unknownTagContentObj = item[toolName]
					let reconstructedXml = `<${toolName}`
					let innerText = ""

					if (typeof unknownTagContentObj === "object" && unknownTagContentObj !== null) {
						Object.entries(unknownTagContentObj).forEach(([key, value]) => {
							if (key.startsWith(attributeNamePrefixKey)) {
								reconstructedXml += ` ${key.substring(attributeNamePrefixKey.length)}="${String(value).replace(/"/g, '"')}"`
							} else if (key === textNodeNameKey) {
								innerText += String(value)
							} else {
								// This unknown tag has nested XML elements.
								// A full reconstruction is complex. For now, treat as simple text.
								// This might not perfectly match original parser for complex unknown structures.
								innerText += `<${key}>${JSON.stringify(value)}</${key}>` // Basic representation
							}
						})
					} else if (unknownTagContentObj !== undefined && unknownTagContentObj !== null) {
						innerText = String(unknownTagContentObj)
					}

					// Escape special characters in innerText if it wasn't from a text node directly
					// or if it had child elements that we've stringified.
					// Text from #text node via parser is already decoded.
					// If we constructed innerText from other sources, it might need escaping.
					// For simplicity, assuming #text covers most simple cases.
					// More complex unknown tags might not be perfectly reconstructed to original string.

					reconstructedXml += `>${innerText}</${toolName}>`

					// Append to last text block or create new
					const lastBlock = contentBlocks.length > 0 ? contentBlocks[contentBlocks.length - 1] : null
					if (lastBlock && lastBlock.type === "text") {
						lastBlock.content += reconstructedXml
					} else {
						contentBlocks.push({ type: "text", content: reconstructedXml, partial: false })
					}
				}
			}
		}
	}

	// Final pass to trim content and parameter values, and filter out empty text blocks,
	// to align with the behavior of the original parser.
	const processedBlocks = contentBlocks
		.map((block) => {
			if (block.type === "text") {
				return { ...block, content: block.content.trim() }
			}
			if (block.type === "tool_use") {
				const trimmedParams: { [key in ToolParamName]?: string } = {}
				for (const key in block.params) {
					trimmedParams[key as ToolParamName] = (block.params[key as ToolParamName] || "").trim()
				}
				return { ...block, params: trimmedParams as { [key in ToolParamName]: string } }
			}
			return block
		})
		.filter((block) => {
			if (block.type === "text" && block.content.length === 0) {
				return false // Remove text blocks that are empty after trimming
			}
			return true
		})

	// If the last block is text or an unclosed tool_use, mark it as partial.
	if (processedBlocks.length > 0) {
		const lastBlock = processedBlocks[processedBlocks.length - 1]
		if (lastBlock.type === "text") {
			lastBlock.partial = true
		} else if (lastBlock.type === "tool_use") {
			const toolClosingTag = `</${lastBlock.name}>`
			// Check if the original message (trimmed of trailing whitespace) ends with the tool's closing tag.
			// Also check for partial parameters by seeing if the last param tag is closed.
			// This is a heuristic. A truly partial param inside a closed tool is hard to detect
			// with this parser's output alone without more complex string analysis.
			// The test cases imply that if a param is partial, the main tool tag is also often unclosed at string end.
			if (!assistantMessage.trimEnd().endsWith(toolClosingTag)) {
				lastBlock.partial = true
			}
			// Heuristic for partial parameters: if the tool is the last block and not properly closed,
			// and it has parameters, assume it could be a partially written parameter.
			// The primary check is the tool's own closing tag.
			// The original parser's logic for partial params is more granular.
			// For now, if the tool tag itself isn't closed at the end of the string, mark partial.
		}
	}

	// Manual handling for write_to_file.content to ensure full capture
	// This needs to happen *after* initial parsing and block formation,
	// but *before* final trimming if we want to trim the manually extracted content.
	// Or, apply trimming within this loop for the content param.
	// for (let i = 0; i < processedBlocks.length; i++) {
	// 	const block = processedBlocks[i]
	// 	if (block.type === "tool_use" && block.name === "write_to_file") {
	// 		// Find the original string segment for this tool_use
	// 		// This is a simplification; accurately finding the *exact* segment
	// 		// in the original string corresponding to *this specific* tool_use
	// 		// can be complex if multiple identical tool_uses exist.
	// 		// For the test case, we assume it's the primary one.

	// 		const toolUseOpeningTag = `<${block.name}>`
	// 		const toolUseClosingTag = `</${block.name}>`
	// 		const contentParamName: ToolParamName = "content"
	// 		const contentOpeningTag = `<${contentParamName}>`
	// 		const contentClosingTag = `</${contentParamName}>`

	// 		let toolStartIndex = -1
	// 		let searchOffset = 0

	// 		// Attempt to find the Nth occurrence of the tool tag if multiple exist
	// 		let currentOccurrence = 0
	// 		for (let k = 0; k < i; k++) {
	// 			const prevBlock = processedBlocks[k]
	// 			if (prevBlock.type === "tool_use" && prevBlock.name === block.name) {
	// 				currentOccurrence++
	// 			}
	// 		}

	// 		let occurrencesFound = 0
	// 		while (occurrencesFound <= currentOccurrence) {
	// 			toolStartIndex = assistantMessage.indexOf(toolUseOpeningTag, searchOffset)
	// 			if (toolStartIndex === -1) break
	// 			occurrencesFound++
	// 			if (occurrencesFound > currentOccurrence) break
	// 			searchOffset = toolStartIndex + toolUseOpeningTag.length
	// 		}

	// 		if (toolStartIndex !== -1) {
	// 			const toolEndIndex = assistantMessage.indexOf(
	// 				toolUseClosingTag,
	// 				toolStartIndex + toolUseOpeningTag.length,
	// 			)
	// 			if (toolEndIndex !== -1) {
	// 				const toolString = assistantMessage.substring(
	// 					toolStartIndex + toolUseOpeningTag.length,
	// 					toolEndIndex,
	// 				)

	// 				const contentStartIndex = toolString.indexOf(contentOpeningTag)
	// 				const contentEndIndex = toolString.lastIndexOf(contentClosingTag)

	// 				if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
	// 					const extractedContent = toolString.substring(
	// 						contentStartIndex + contentOpeningTag.length,
	// 						contentEndIndex,
	// 					)
	// 					// Update the params.content. The final .map().filter() pass will trim it.
	// 					block.params[contentParamName] = extractedContent
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	return processedBlocks
}
