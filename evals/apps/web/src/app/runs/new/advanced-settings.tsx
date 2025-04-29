"use client"

import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { ChevronDown, ChevronUp } from "lucide-react"

import {
	FormField,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	Input,
	Slider,
	Button,
	Textarea,
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	Switch,
} from "@/components/ui"

export function AdvancedSettings() {
	const [isOpen, setIsOpen] = useState(false)
	const { control, setValue, watch } = useFormContext()

	// Get current settings or initialize empty object
	const settings = watch("settings") || {}

	// Helper function to update settings
	const updateSetting = (key: string, value: any) => {
		setValue("settings", {
			...settings,
			[key]: value,
		})
	}

	return (
		<div className="mt-4 border rounded-md p-4">
			<Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
				<CollapsibleTrigger asChild>
					<Button variant="ghost" className="flex w-full justify-between p-2">
						<span className="font-medium">Advanced Settings</span>
						{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="space-y-4 pt-2">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Model Temperature */}
						<FormField
							control={control}
							name="settings.modelTemperature"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Model Temperature</FormLabel>
									<div className="flex items-center gap-2">
										<Slider
											defaultValue={[settings.modelTemperature ?? 0.7]}
											min={0}
											max={1}
											step={0.01}
											onValueChange={(value) => updateSetting("modelTemperature", value[0])}
										/>
										<span className="w-12 text-center">{settings.modelTemperature ?? 0.7}</span>
									</div>
									<FormDescription>
										Controls randomness: lower values are more deterministic
									</FormDescription>
								</FormItem>
							)}
						/>

						{/* Rate Limit Seconds */}
						<FormField
							control={control}
							name="settings.rateLimitSeconds"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Rate Limit (seconds)</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={0}
											value={settings.rateLimitSeconds ?? 0}
											onChange={(e) => updateSetting("rateLimitSeconds", Number(e.target.value))}
										/>
									</FormControl>
									<FormDescription>Delay between API requests (0 for no limit)</FormDescription>
								</FormItem>
							)}
						/>

						{/* Max Read File Line */}
						<FormField
							control={control}
							name="settings.maxReadFileLine"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Max Read File Line</FormLabel>
									<FormControl>
										<Input
											type="number"
											value={settings.maxReadFileLine ?? -1}
											onChange={(e) => updateSetting("maxReadFileLine", Number(e.target.value))}
										/>
									</FormControl>
									<FormDescription>Maximum lines to read (-1 for unlimited)</FormDescription>
								</FormItem>
							)}
						/>

						{/* Terminal Output Line Limit */}
						<FormField
							control={control}
							name="settings.terminalOutputLineLimit"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Terminal Output Line Limit</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={0}
											value={settings.terminalOutputLineLimit ?? 500}
											onChange={(e) =>
												updateSetting("terminalOutputLineLimit", Number(e.target.value))
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{/* Terminal Shell Integration Timeout */}
						<FormField
							control={control}
							name="settings.terminalShellIntegrationTimeout"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Terminal Shell Integration Timeout</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={0}
											value={settings.terminalShellIntegrationTimeout ?? 10000}
											onChange={(e) =>
												updateSetting("terminalShellIntegrationTimeout", Number(e.target.value))
											}
										/>
									</FormControl>
									<FormDescription>Timeout in milliseconds</FormDescription>
								</FormItem>
							)}
						/>

						{/* Terminal Command Delay */}
						<FormField
							control={control}
							name="settings.terminalCommandDelay"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Terminal Command Delay</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={0}
											value={settings.terminalCommandDelay ?? 1000}
											onChange={(e) =>
												updateSetting("terminalCommandDelay", Number(e.target.value))
											}
										/>
									</FormControl>
									<FormDescription>Delay in milliseconds</FormDescription>
								</FormItem>
							)}
						/>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{/* Terminal PowerShell Counter */}
						<FormField
							control={control}
							name="settings.terminalPowershellCounter"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Terminal PowerShell Counter</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={settings.terminalPowershellCounter ?? false}
											onCheckedChange={(value: boolean) =>
												updateSetting("terminalPowershellCounter", value)
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{/* Terminal Zsh Clear EOL Mark */}
						<FormField
							control={control}
							name="settings.terminalZshClearEolMark"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Terminal Zsh Clear EOL Mark</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={settings.terminalZshClearEolMark ?? true}
											onCheckedChange={(value: boolean) =>
												updateSetting("terminalZshClearEolMark", value)
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{/* Terminal Zsh Oh My */}
						<FormField
							control={control}
							name="settings.terminalZshOhMy"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Terminal Zsh Oh My</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={settings.terminalZshOhMy ?? true}
											onCheckedChange={(value: boolean) =>
												updateSetting("terminalZshOhMy", value)
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{/* Terminal Zsh P10k */}
						<FormField
							control={control}
							name="settings.terminalZshP10k"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Terminal Zsh P10k</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={settings.terminalZshP10k ?? false}
											onCheckedChange={(value: boolean) =>
												updateSetting("terminalZshP10k", value)
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>

						{/* Terminal Zdotdir */}
						<FormField
							control={control}
							name="settings.terminalZdotdir"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
									<div className="space-y-0.5">
										<FormLabel>Terminal Zdotdir</FormLabel>
									</div>
									<FormControl>
										<Switch
											checked={settings.terminalZdotdir ?? false}
											onCheckedChange={(value: boolean) =>
												updateSetting("terminalZdotdir", value)
											}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					</div>

					{/* Custom Mode Settings */}
					<div className="mt-6 border-t pt-6">
						<h3 className="text-lg font-medium mb-4">Custom Mode Settings</h3>

						{/* Role Definition */}
						<FormField
							control={control}
							name="settings.customModePrompts.code.roleDefinition"
							render={({ field }) => (
								<FormItem className="mb-4">
									<FormLabel>Role Definition</FormLabel>
									<FormControl>
										<Textarea
											placeholder="You are Roo, an advanced AI software engineering assistant with deep expertise across programming languages, frameworks, and best practices."
											className="min-h-[100px]"
											value={settings.customModePrompts?.code?.roleDefinition || ""}
											onChange={(e) => {
												const customModePrompts = settings.customModePrompts || {}
												const codePrompt = customModePrompts.code || {}
												updateSetting("customModePrompts", {
													...customModePrompts,
													code: {
														...codePrompt,
														roleDefinition: e.target.value,
													},
												})
											}}
										/>
									</FormControl>
									<FormDescription>
										Define the role for the AI assistant (leave empty to use default)
									</FormDescription>
								</FormItem>
							)}
						/>

						{/* Custom Instructions */}
						<FormField
							control={control}
							name="settings.customModePrompts.code.customInstructions"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Custom Instructions</FormLabel>
									<FormControl>
										<Textarea
											placeholder="When programming, prioritize the following: First understand the requirements fully, consider architecture and design before implementation..."
											className="min-h-[200px]"
											value={settings.customModePrompts?.code?.customInstructions || ""}
											onChange={(e) => {
												const customModePrompts = settings.customModePrompts || {}
												const codePrompt = customModePrompts.code || {}
												updateSetting("customModePrompts", {
													...customModePrompts,
													code: {
														...codePrompt,
														customInstructions: e.target.value,
													},
												})
											}}
										/>
									</FormControl>
									<FormDescription>
										Custom instructions for the AI assistant (leave empty to use default)
									</FormDescription>
								</FormItem>
							)}
						/>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
