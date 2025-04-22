import { Worker } from "worker_threads"
import path from "path"

interface WorkerConfig {
	retryAttempts: number
	maxRetries: number
	retryDelay: number
}

export class WorkerManager {
	private static instance: WorkerManager
	private workers: Map<string, Worker>
	private configs: Map<string, WorkerConfig>
	private isDestroyed: boolean

	private constructor() {
		this.workers = new Map()
		this.configs = new Map()
		this.isDestroyed = false
	}

	public static getInstance(): WorkerManager {
		if (!WorkerManager.instance) {
			WorkerManager.instance = new WorkerManager()
		}
		return WorkerManager.instance
	}

	public async initializeWorker(
		workerId: string,
		workerPath: string,
		config: Partial<WorkerConfig> = {},
	): Promise<Worker> {
		if (this.isDestroyed) {
			throw new Error("WorkerManager has been destroyed")
		}

		// If worker already exists, return it
		if (this.workers.has(workerId)) {
			return this.workers.get(workerId)!
		}

		const workerConfig: WorkerConfig = {
			retryAttempts: 0,
			maxRetries: config.maxRetries ?? 3,
			retryDelay: config.retryDelay ?? 1000,
		}

		const absolutePath = path.resolve(__dirname, workerPath)
		const worker = new Worker(absolutePath)

		worker.on("error", async (error) => {
			console.error(`Worker ${workerId} error:`, error)
			await this.handleWorkerError(workerId, workerConfig)
		})

		worker.on("exit", async (code) => {
			if (code !== 0) {
				console.error(`Worker ${workerId} exited with code ${code}`)
				await this.handleWorkerError(workerId, workerConfig)
			}
		})

		this.workers.set(workerId, worker)
		this.configs.set(workerId, workerConfig)

		return worker
	}

	private async handleWorkerError(workerId: string, config: WorkerConfig): Promise<void> {
		if (config.retryAttempts >= config.maxRetries) {
			console.error(`Max retry attempts reached for worker ${workerId}, worker will not restart`)
			return
		}

		config.retryAttempts++
		const delay = config.retryDelay * Math.pow(2, config.retryAttempts - 1)

		console.log(
			`Attempting to restart worker ${workerId} (attempt ${config.retryAttempts} of ${config.maxRetries}) after ${delay}ms`,
		)

		await new Promise((resolve) => setTimeout(resolve, delay))

		const worker = this.workers.get(workerId)
		if (worker) {
			await worker.terminate()
			this.workers.delete(workerId)
			this.configs.delete(workerId)
		}
	}

	public getWorker(workerId: string): Worker | undefined {
		return this.workers.get(workerId)
	}

	public async cleanup(): Promise<void> {
		if (this.isDestroyed) {
			return
		}

		this.isDestroyed = true

		const terminationPromises = Array.from(this.workers.values()).map((worker) => worker.terminate())

		await Promise.all(terminationPromises)

		this.workers.clear()
		this.configs.clear()
	}

	public async [Symbol.asyncDispose](): Promise<void> {
		await this.cleanup()
	}
}

// Export singleton instance
export const workerManager = WorkerManager.getInstance()
