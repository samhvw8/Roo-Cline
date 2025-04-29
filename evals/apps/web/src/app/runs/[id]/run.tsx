"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { LoaderCircle, Download, ArrowLeft } from "lucide-react"

import * as db from "@evals/db"

import { formatCurrency, formatDuration, formatTokens } from "@/lib/formatters"
import { useRunStatus } from "@/hooks/use-run-status"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Button } from "@/components/ui"

import { TaskStatus } from "./task-status"
import { ConnectionStatus } from "./connection-status"
import { EventSourceStatus } from "@/hooks/use-event-source"

type TaskMetrics = Pick<db.TaskMetrics, "tokensIn" | "tokensOut" | "tokensContext" | "duration" | "cost">

interface Task extends db.Task {
	taskMetrics?: TaskMetrics | null
}

export function Run({ run }: { run: db.Run }) {
	const router = useRouter()
	const { tasks, status, tokenUsage, usageUpdatedAt } = useRunStatus(run) as {
		tasks: Task[]
		status: EventSourceStatus
		tokenUsage: Map<number, any>
		usageUpdatedAt: number
	}

	const taskMetrics: Record<number, TaskMetrics> = useMemo(() => {
		const metrics: Record<number, TaskMetrics> = {}

		tasks?.forEach((task) => {
			const usage = tokenUsage.get(task.id)

			if (task.finishedAt && task.taskMetrics) {
				metrics[task.id] = task.taskMetrics
			} else if (usage) {
				metrics[task.id] = {
					tokensIn: usage.totalTokensIn,
					tokensOut: usage.totalTokensOut,
					tokensContext: usage.contextTokens,
					duration: usage.duration ?? 0,
					cost: usage.totalCost,
				}
			}
		})

		return metrics
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tasks, tokenUsage, usageUpdatedAt])

	const exportToCSV = () => {
		if (!tasks || tasks.length === 0) return

		// Prepare CSV headers
		const headers = [
			"Exercise",
			"Language",
			"Status",
			"Tokens In",
			"Tokens Out",
			"Context Tokens",
			"Duration (s)",
			"Cost ($)",
		].join(",")

		// Prepare CSV rows
		const rows = tasks.map((task) => {
			const metrics = taskMetrics[task.id]
			const status = task.passed === true ? "Passed" : task.passed === false ? "Failed" : "Pending"
			const tokensIn = metrics ? metrics.tokensIn : 0
			const tokensOut = metrics ? metrics.tokensOut : 0
			const contextTokens = metrics ? metrics.tokensContext : 0
			const duration = metrics ? (metrics.duration / 1000).toFixed(2) : "0"
			const cost = metrics ? metrics.cost.toFixed(4) : "0"

			return [task.exercise, task.language, status, tokensIn, tokensOut, contextTokens, duration, cost].join(",")
		})

		// Combine headers and rows
		const csvContent = [headers, ...rows].join("\n")

		// Create a Blob and download link
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
		const url = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.setAttribute("href", url)
		link.setAttribute("download", `run-${run.id}-results.csv`)
		link.style.visibility = "hidden"
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
	}

	return (
		<>
			<div>
				<div className="mb-6">
					<div className="flex justify-between items-center">
						<div>
							<h1 className="text-3xl font-bold">Run #{run.id}</h1>
							<div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
								<div>
									<div className="text-sm font-medium text-muted-foreground">Provider</div>
									<div>{run.model.split("/")[0] || "Unknown"}</div>
								</div>
								<div>
									<div className="text-sm font-medium text-muted-foreground">Model</div>
									<div>{run.model.includes("/") ? run.model.split("/")[1] : run.model}</div>
								</div>
								<div>
									<div className="text-sm font-medium text-muted-foreground">Temperature</div>
									<div>
										{run.settings?.modelTemperature !== undefined &&
										run.settings?.modelTemperature !== null
											? run.settings.modelTemperature
											: "Default"}
									</div>
								</div>
								{run.description && (
									<div className="col-span-2">
										<div className="text-sm font-medium text-muted-foreground">Notes</div>
										<div className="max-w-[500px]">{run.description}</div>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center gap-4">
							<Button variant="outline" size="sm" onClick={() => router.push("/")} title="Back to runs">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Button>
							{tasks && tasks.length > 0 && (
								<Button variant="outline" size="sm" onClick={exportToCSV} title="Export results to CSV">
									<Download className="mr-2 h-4 w-4" />
									Export CSV
								</Button>
							)}
							{!run.taskMetricsId && <ConnectionStatus status={status} pid={run.pid} />}
						</div>
					</div>
				</div>
				{!tasks ? (
					<div className="flex justify-center py-8">
						<LoaderCircle className="size-6 animate-spin" />
					</div>
				) : (
					<div className="rounded-md border">
						<div className="p-4 bg-muted/50">
							<h2 className="text-lg font-semibold">Task Results</h2>
						</div>
						<Table className="w-full">
							<TableHeader>
								<TableRow>
									<TableHead>Exercise</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Cost</TableHead>
									<TableHead>Tokens In</TableHead>
									<TableHead>Tokens Out</TableHead>
									<TableHead>Context</TableHead>
									<TableHead>Duration</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tasks.map((task) => (
									<TableRow key={task.id}>
										<TableCell>
											<div className="truncate max-w-[250px]">
												{task.language}/{task.exercise}
											</div>
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2 whitespace-nowrap">
												<TaskStatus
													task={task}
													running={!!task.startedAt || !!tokenUsage.get(task.id)}
												/>
												<span>
													{task.passed === true
														? "Passed"
														: task.passed === false
															? "Failed"
															: "Pending"}
												</span>
											</div>
										</TableCell>
										<TableCell className="font-mono text-sm whitespace-nowrap">
											{taskMetrics[task.id] && formatCurrency(taskMetrics[task.id]!.cost)}
										</TableCell>
										{taskMetrics[task.id] ? (
											<>
												<TableCell className="font-mono text-sm whitespace-nowrap">
													{formatTokens(taskMetrics[task.id]!.tokensIn)}
												</TableCell>
												<TableCell className="font-mono text-sm whitespace-nowrap">
													{formatTokens(taskMetrics[task.id]!.tokensOut)}
												</TableCell>
												<TableCell className="font-mono text-sm whitespace-nowrap">
													{formatTokens(taskMetrics[task.id]!.tokensContext)}
												</TableCell>
												<TableCell className="font-mono text-sm whitespace-nowrap">
													{taskMetrics[task.id]!.duration
														? formatDuration(taskMetrics[task.id]!.duration)
														: "-"}
												</TableCell>
											</>
										) : (
											<>
												<TableCell />
												<TableCell />
												<TableCell />
												<TableCell />
											</>
										)}
									</TableRow>
								))}
								{tasks.length === 0 && (
									<TableRow>
										<TableCell colSpan={7} className="text-center py-6">
											<div className="text-muted-foreground">No tasks found for this run.</div>
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</>
	)
}
