import * as vscode from "vscode"
import { getWorkspacePath } from "../../utils/path"
import { ContextProxy } from "../../core/config/ContextProxy"
import { VectorStoreSearchResult } from "./interfaces"
import { IndexingState } from "./interfaces/manager"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { CodeIndexServiceFactory } from "./service-factory"
import { CodeIndexSearchService } from "./search-service"
import { CodeIndexOrchestrator } from "./orchestrator"
import { CacheManager } from "./cache-manager"

export class CodeIndexManager {
	// --- Singleton Implementation ---
	private static instances = new Map<string, CodeIndexManager>() // Map workspace path to instance

	// Specialized class instances
	private readonly _configManager: CodeIndexConfigManager
	private readonly _stateManager: CodeIndexStateManager
	private readonly _serviceFactory: CodeIndexServiceFactory
	private readonly _orchestrator: CodeIndexOrchestrator
	private readonly _searchService: CodeIndexSearchService
	private readonly _cacheManager: CacheManager

	public static getInstance(context: vscode.ExtensionContext, contextProxy?: ContextProxy): CodeIndexManager {
		const workspacePath = getWorkspacePath() // Assumes single workspace for now
		if (!workspacePath) {
			throw new Error("Cannot get CodeIndexManager instance without an active workspace.")
		}

		if (!CodeIndexManager.instances.has(workspacePath) && contextProxy) {
			CodeIndexManager.instances.set(workspacePath, new CodeIndexManager(workspacePath, context, contextProxy))
		}
		return CodeIndexManager.instances.get(workspacePath)!
	}

	public static disposeAll(): void {
		for (const instance of CodeIndexManager.instances.values()) {
			instance.dispose()
		}
		CodeIndexManager.instances.clear()
	}

	private readonly workspacePath: string
	private readonly context: vscode.ExtensionContext

	// Private constructor for singleton pattern
	private constructor(workspacePath: string, context: vscode.ExtensionContext, contextProxy: ContextProxy) {
		this.workspacePath = workspacePath
		this.context = context

		// Initialize state manager first since other components depend on it
		this._stateManager = new CodeIndexStateManager()

		// Initialize remaining specialized classes
		this._configManager = new CodeIndexConfigManager(contextProxy)
		this._cacheManager = new CacheManager(context, workspacePath)
		this._serviceFactory = new CodeIndexServiceFactory(this._configManager, workspacePath, this._cacheManager)
		this._orchestrator = new CodeIndexOrchestrator(
			this._configManager,
			this._stateManager,
			this._serviceFactory,
			context,
			workspacePath,
			this._cacheManager,
		)
		this._searchService = new CodeIndexSearchService(
			this._configManager,
			this._stateManager,
			this._serviceFactory,
			context,
			this._cacheManager,
		)
	}

	// --- Public API ---

	public get onProgressUpdate() {
		return this._stateManager.onProgressUpdate
	}

	public get state(): IndexingState {
		return this._orchestrator.state
	}

	public get isFeatureEnabled(): boolean {
		return this._configManager.isFeatureEnabled
	}

	public get isFeatureConfigured(): boolean {
		return this._configManager.isFeatureConfigured
	}

	/**
	 * Loads persisted configuration from globalState.
	 */
	public async loadConfiguration(): Promise<void> {
		const { requiresRestart, requiresClear } = await this._configManager.loadConfiguration()

		if (requiresClear) {
			console.log("[CodeIndexManager] Embedding dimension changed. Clearing existing index data...")
			await this.clearIndexData()
			// No need to explicitly set requiresRestart = true, as requiresClear implies a restart need.
		}

		if (requiresRestart || requiresClear) {
			console.log(
				`[CodeIndexManager] Configuration change requires restart (Restart: ${requiresRestart}, Dimension Changed: ${requiresClear}). Starting indexing...`,
			)
			this.startIndexing()
		}
	}

	/**
	 * Initiates the indexing process (initial scan and starts watcher).
	 */

	public async startIndexing(): Promise<void> {
		await this._cacheManager.initialize()
		await this._orchestrator.startIndexing()
	}

	/**
	 * Stops the file watcher and potentially cleans up resources.
	 */
	public stopWatcher(): void {
		this._orchestrator.stopWatcher()
	}

	/**
	 * Cleans up the manager instance.
	 */
	public dispose(): void {
		this.stopWatcher()
		this._stateManager.dispose()
		console.log(`[CodeIndexManager] Disposed for workspace: ${this.workspacePath}`)
	}

	/**
	 * Clears all index data by stopping the watcher, clearing the Qdrant collection,
	 * and deleting the cache file.
	 */
	public async clearIndexData(): Promise<void> {
		await this._orchestrator.clearIndexData()
		await this._cacheManager.clearCacheFile()
	}

	// --- Private Helpers ---

	public getCurrentStatus() {
		return this._stateManager.getCurrentStatus()
	}

	public setWebviewProvider(provider: { postMessage: (msg: any) => void }) {
		this._stateManager.setWebviewProvider(provider)
	}

	public async searchIndex(query: string, limit: number): Promise<VectorStoreSearchResult[]> {
		return this._searchService.searchIndex(query, limit)
	}
}
