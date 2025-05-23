import { listFiles } from "../../glob/list-files"
import { RooIgnoreController } from "../../../core/ignore/RooIgnoreController"
import { stat } from "fs/promises"
import * as path from "path"
import { getWorkspacePath } from "../../../utils/path"
import { scannerExtensions } from "../shared/supported-extensions"
import * as vscode from "vscode"
import { CodeBlock, ICodeParser, IEmbedder, IVectorStore, IDirectoryScanner } from "../interfaces"
import { createHash } from "crypto"
import { v5 as uuidv5 } from "uuid"
import pLimit from "p-limit"
import { Mutex } from "async-mutex"

export class DirectoryScanner implements IDirectoryScanner {
	// Constants moved inside the class
	private static readonly QDRANT_CODE_BLOCK_NAMESPACE = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
	private static readonly MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024 // 1MB
	private static readonly MAX_LIST_FILES_LIMIT = 2_000
	private static readonly BATCH_SEGMENT_THRESHOLD = 30 // Number of code segments to batch for embeddings/upserts
	private static readonly MAX_BATCH_RETRIES = 3
	private static readonly INITIAL_RETRY_DELAY_MS = 500
	private static readonly PARSING_CONCURRENCY = 10
	private static readonly BATCH_PROCESSING_CONCURRENCY = 10

	constructor(
		private readonly embedder: IEmbedder,
		private readonly qdrantClient: IVectorStore,
		private readonly codeParser: ICodeParser,
	) {}

	/**
	 * Recursively scans a directory for code blocks in supported files.
	 * @param directoryPath The directory to scan
	 * @param rooIgnoreController Optional RooIgnoreController instance for filtering
	 * @param context VS Code ExtensionContext for cache storage
	 * @param onError Optional error handler callback
	 * @returns Promise<{codeBlocks: CodeBlock[], stats: {processed: number, skipped: number}}> Array of parsed code blocks and processing stats
	 */
	public async scanDirectory(
		directoryPath: string,
		context?: vscode.ExtensionContext,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
		onFileParsed?: (fileBlockCount: number) => void,
	): Promise<{ codeBlocks: CodeBlock[]; stats: { processed: number; skipped: number }; totalBlockCount: number }> {
		// Get all files recursively (handles .gitignore automatically)
		const [allPaths, _] = await listFiles(directoryPath, true, DirectoryScanner.MAX_LIST_FILES_LIMIT)

		// Filter out directories (marked with trailing '/')
		const filePaths = allPaths.filter((p) => !p.endsWith("/"))

		// Initialize RooIgnoreController if not provided
		const ignoreController = new RooIgnoreController(directoryPath)

		await ignoreController.initialize()

		// Filter paths using .rooignore
		const allowedPaths = ignoreController.filterPaths(filePaths)

		// Filter by supported extensions
		const supportedPaths = allowedPaths.filter((filePath) => {
			const ext = path.extname(filePath).toLowerCase()
			return scannerExtensions.includes(ext)
		})

		// Initialize cache
		const cachePath = context?.globalStorageUri
			? vscode.Uri.joinPath(
					context.globalStorageUri,
					`roo-index-cache-${createHash("sha256").update(directoryPath).digest("hex")}.json`,
				)
			: undefined
		const oldHashes = cachePath ? await this.loadHashCache(cachePath) : {}
		const newHashes: Record<string, string> = {}
		const processedFiles = new Set<string>()
		const codeBlocks: CodeBlock[] = []
		let processedCount = 0
		let skippedCount = 0

		// Initialize parallel processing tools
		const parseLimiter = pLimit(DirectoryScanner.PARSING_CONCURRENCY) // Concurrency for file parsing
		const batchLimiter = pLimit(DirectoryScanner.BATCH_PROCESSING_CONCURRENCY) // Concurrency for batch processing
		const mutex = new Mutex()

		// Shared batch accumulators (protected by mutex)
		let currentBatchBlocks: CodeBlock[] = []
		let currentBatchTexts: string[] = []
		let currentBatchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[] = []
		const activeBatchPromises: Promise<void>[] = []

		// Initialize block counter
		let totalBlockCount = 0

		// Process all files in parallel with concurrency control
		const parsePromises = supportedPaths.map((filePath) =>
			parseLimiter(async () => {
				try {
					// Check file size
					const stats = await stat(filePath)
					if (stats.size > DirectoryScanner.MAX_FILE_SIZE_BYTES) {
						skippedCount++ // Skip large files
						return
					}

					// Read file content
					const content = await vscode.workspace.fs
						.readFile(vscode.Uri.file(filePath))
						.then((buffer) => Buffer.from(buffer).toString("utf-8"))

					// Calculate current hash
					const currentFileHash = createHash("sha256").update(content).digest("hex")
					processedFiles.add(filePath)

					// Check against cache
					const cachedFileHash = oldHashes[filePath]
					if (cachedFileHash === currentFileHash) {
						// File is unchanged
						newHashes[filePath] = currentFileHash
						skippedCount++
						return
					}

					// File is new or changed - parse it using the injected parser function
					const blocks = await this.codeParser.parseFile(filePath, { content, fileHash: currentFileHash })
					const fileBlockCount = blocks.length
					onFileParsed?.(fileBlockCount)
					codeBlocks.push(...blocks)
					processedCount++

					// Process embeddings if configured
					if (this.embedder && this.qdrantClient && blocks.length > 0) {
						// Add to batch accumulators
						let addedBlocksFromFile = false
						for (const block of blocks) {
							const trimmedContent = block.content.trim()
							if (trimmedContent) {
								const release = await mutex.acquire()
								totalBlockCount += fileBlockCount
								try {
									currentBatchBlocks.push(block)
									currentBatchTexts.push(trimmedContent)
									addedBlocksFromFile = true

									if (addedBlocksFromFile) {
										currentBatchFileInfos.push({
											filePath,
											fileHash: currentFileHash,
											isNew: !oldHashes[filePath],
										})
									}

									// Check if batch threshold is met
									if (currentBatchBlocks.length >= DirectoryScanner.BATCH_SEGMENT_THRESHOLD) {
										// Copy current batch data and clear accumulators
										const batchBlocks = [...currentBatchBlocks]
										const batchTexts = [...currentBatchTexts]
										const batchFileInfos = [...currentBatchFileInfos]
										currentBatchBlocks = []
										currentBatchTexts = []
										currentBatchFileInfos = []

										// Queue batch processing
										const batchPromise = batchLimiter(() =>
											this.processBatch(
												batchBlocks,
												batchTexts,
												batchFileInfos,
												newHashes,
												onError,
												onBlocksIndexed,
											),
										)
										activeBatchPromises.push(batchPromise)
									}
								} finally {
									release()
								}
							}
						}
					} else {
						// Only update hash if not being processed in a batch
						newHashes[filePath] = currentFileHash
					}
				} catch (error) {
					console.error(`Error processing file ${filePath}:`, error)
					if (onError) {
						onError(error instanceof Error ? error : new Error(`Unknown error processing file ${filePath}`))
					}
				}
			}),
		)

		// Wait for all parsing to complete
		await Promise.all(parsePromises)

		// Process any remaining items in batch
		if (currentBatchBlocks.length > 0) {
			const release = await mutex.acquire()
			try {
				// Copy current batch data and clear accumulators
				const batchBlocks = [...currentBatchBlocks]
				const batchTexts = [...currentBatchTexts]
				const batchFileInfos = [...currentBatchFileInfos]
				currentBatchBlocks = []
				currentBatchTexts = []
				currentBatchFileInfos = []

				// Queue final batch processing
				const batchPromise = batchLimiter(() =>
					this.processBatch(batchBlocks, batchTexts, batchFileInfos, newHashes, onError, onBlocksIndexed),
				)
				activeBatchPromises.push(batchPromise)
			} finally {
				release()
			}
		}

		// Wait for all batch processing to complete
		await Promise.all(activeBatchPromises)

		// Handle deleted files (don't add them to newHashes)
		if (cachePath) {
			for (const cachedFilePath of Object.keys(oldHashes)) {
				if (!processedFiles.has(cachedFilePath)) {
					// File was deleted or is no longer supported/indexed
					if (this.qdrantClient) {
						try {
							console.log(`[DirectoryScanner] Deleting points for deleted file: ${cachedFilePath}`)
							await this.qdrantClient.deletePointsByFilePath(cachedFilePath)
						} catch (error) {
							console.error(`[DirectoryScanner] Failed to delete points for ${cachedFilePath}:`, error)
							if (onError) {
								onError(
									error instanceof Error
										? error
										: new Error(`Unknown error deleting points for ${cachedFilePath}`),
								)
							}
							// Decide if we should re-throw or just log
						}
					}
					// The file is implicitly removed from the cache because it's not added to newHashes
				}
			}

			// Save the updated cache
			await this.saveHashCache(cachePath, newHashes)
		}

		return {
			codeBlocks,
			stats: {
				processed: processedCount,
				skipped: skippedCount,
			},
			totalBlockCount,
		}
	}

	private async loadHashCache(cachePath: vscode.Uri): Promise<Record<string, string>> {
		try {
			const fileData = await vscode.workspace.fs.readFile(cachePath)
			return JSON.parse(Buffer.from(fileData).toString("utf-8"))
		} catch (error) {
			if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
				return {} // Cache file doesn't exist yet, return empty object
			}
			console.error("Error loading hash cache:", error)
			return {} // Return empty on other errors to allow indexing to proceed
		}
	}

	private async saveHashCache(cachePath: vscode.Uri, hashes: Record<string, string>): Promise<void> {
		try {
			// Ensure directory exists
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cachePath.fsPath)))
			// Write file
			await vscode.workspace.fs.writeFile(cachePath, Buffer.from(JSON.stringify(hashes, null, 2), "utf-8"))
		} catch (error) {
			console.error("Error saving hash cache:", error)
			// Don't re-throw, as failure to save cache shouldn't block the main operation
		}
	}

	private async processBatch(
		batchBlocks: CodeBlock[],
		batchTexts: string[],
		batchFileInfos: { filePath: string; fileHash: string; isNew: boolean }[],
		newHashes: Record<string, string>,
		onError?: (error: Error) => void,
		onBlocksIndexed?: (indexedCount: number) => void,
	): Promise<void> {
		if (batchBlocks.length === 0) return

		let attempts = 0
		let success = false
		let lastError: Error | null = null

		while (attempts < DirectoryScanner.MAX_BATCH_RETRIES && !success) {
			attempts++
			try {
				// --- Deletion Step ---
				const uniqueFilePaths = [
					...new Set(
						batchFileInfos
							.filter((info) => !info.isNew) // Only modified files (not new)
							.map((info) => info.filePath),
					),
				]
				console.log(
					`[DirectoryScanner] Deleting existing points for ${uniqueFilePaths.length} file(s) in batch...`,
				)
				if (uniqueFilePaths.length > 0) {
					try {
						await this.qdrantClient.deletePointsByMultipleFilePaths(uniqueFilePaths)
					} catch (deleteError) {
						console.error(
							`[DirectoryScanner] Failed to delete points for ${uniqueFilePaths.length} files before upsert:`,
							deleteError,
						)
						// Re-throw the error to stop processing this batch attempt
						throw deleteError
					}
				}
				// --- End Deletion Step ---

				// Create embeddings for batch
				const { embeddings } = await this.embedder.createEmbeddings(batchTexts)

				// Prepare points for Qdrant
				const points = batchBlocks.map((block, index) => {
					const workspaceRoot = getWorkspacePath() // Assuming this utility function is available
					// Ensure the block path is relative to the workspace root before resolving
					const relativeBlockPath = path.isAbsolute(block.file_path)
						? path.relative(workspaceRoot, block.file_path)
						: block.file_path
					const absolutePath = path.resolve(workspaceRoot, relativeBlockPath)
					const normalizedAbsolutePath = path.normalize(absolutePath)

					const stableName = `${normalizedAbsolutePath}:${block.start_line}`
					const pointId = uuidv5(stableName, DirectoryScanner.QDRANT_CODE_BLOCK_NAMESPACE)

					return {
						id: pointId,
						vector: embeddings[index],
						payload: {
							filePath: normalizedAbsolutePath, // Store normalized absolute path
							codeChunk: block.content,
							startLine: block.start_line,
							endLine: block.end_line,
						},
					}
				})

				// Upsert points to Qdrant
				await this.qdrantClient.upsertPoints(points)
				onBlocksIndexed?.(batchBlocks.length)

				// Update hashes for successfully processed files in this batch
				for (const fileInfo of batchFileInfos) {
					newHashes[fileInfo.filePath] = fileInfo.fileHash
				}
				success = true
				console.log(`[DirectoryScanner] Successfully processed batch of ${batchBlocks.length} blocks.`)
			} catch (error) {
				lastError = error as Error
				console.error(`[DirectoryScanner] Error processing batch (attempt ${attempts}):`, error)

				if (attempts < DirectoryScanner.MAX_BATCH_RETRIES) {
					const delay = DirectoryScanner.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1)
					console.log(`[DirectoryScanner] Retrying batch in ${delay}ms...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		if (!success && lastError) {
			console.error(
				`[DirectoryScanner] Failed to process batch after ${DirectoryScanner.MAX_BATCH_RETRIES} attempts`,
			)
			if (onError) {
				onError(
					new Error(
						`Failed to process batch after ${DirectoryScanner.MAX_BATCH_RETRIES} attempts: ${lastError.message}`,
					),
				)
			}
		}
	}
}
