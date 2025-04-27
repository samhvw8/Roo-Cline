import { CommitResult } from "simple-git"
import EventEmitter from "events"

export type CheckpointResult = Partial<CommitResult> & Pick<CommitResult, "commit">

export type CheckpointDiff = {
	paths: {
		relative: string
		absolute: string
	}
	content: {
		before: string
		after: string
	}
}

export interface CheckpointServiceOptions {
	taskId: string
	workspaceDir: string
	shadowDir: string // globalStorageUri.fsPath

	log?: (message: string) => void
	fileTracker?: EventEmitter
}

export interface CheckpointEventMap {
	initialize: { type: "initialize"; workspaceDir: string; baseHash: string; created: boolean; duration: number }
	checkpoint: {
		type: "checkpoint"
		isFirst: boolean
		fromHash: string
		toHash: string
		duration: number
	}
	restore: { type: "restore"; commitHash: string; duration: number }
	error: { type: "error"; error: Error }
}
