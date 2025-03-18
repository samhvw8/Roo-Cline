import { useCallback, useRef, useState } from "react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"

interface FollowUpSuggestProps {
	suggestions?: { answer: string; id?: string }[]
	onSuggestionClick?: (answer: string) => void
	ts: number
}

const FollowUpSuggest = ({ suggestions = [], onSuggestionClick, ts = 1 }: FollowUpSuggestProps) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const buttonRef = useRef<HTMLButtonElement>(null)

	const handleSuggestionClick = useCallback(
		(suggestion: { answer: string; }) => {
			onSuggestionClick?.(suggestion.answer)
		},
		[onSuggestionClick],
	)

	const toggleExpand = useCallback(() => {
		setIsExpanded((prev) => !prev)

		// Use setTimeout to ensure the DOM has updated before scrolling
		setTimeout(() => {
			if (buttonRef.current) {
				// Use scrollIntoView to ensure the button is visible
				buttonRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
			}
		}, 100) // Increased timeout to ensure DOM updates
	}, [])

	// Don't render if there are no suggestions or no click handler
	if (!suggestions?.length || !onSuggestionClick) {
		return null
	}

	const displayedSuggestions = isExpanded ? suggestions : suggestions.slice(0, 1)

	return (
		<div className="h-full" aria-label="Next step suggestions">
			<div className="h-full scrollbar-thin scrollbar-thumb-vscode-scrollbarSlider-background scrollbar-track-transparent">
				<div className={cn("flex gap-2.5 pb-2 flex-col h-full")}>
					{displayedSuggestions.map((suggestion) => (
						<div key={`${suggestion.answer}-${ts}`} className="w-full">
							<Button
								variant="ui-toolkit-primary-no-border"
								className={cn(
									"text-left",
									"focus:outline-none",
									"overflow-hidden",
									"w-full",
									"group h-full",
									"rounded-[3px]",
									"p-[9px] whitespace-pre-wrap break-words overflow-wrap-anywhere",
								)}
								onClick={() => handleSuggestionClick(suggestion)}
								aria-label={`${suggestion.answer}`}>
								<div className="relative h-full w-full">
									<div className="flex justify-between items-start gap-2.5 h-full w-full">
										<span className="block flex-grow p-1 whitespace-pre-wrap break-words overflow-wrap-anywhere w-full h-full pb-6">
											{suggestion.answer}
										</span>
									</div>
								</div>
							</Button>
						</div>
					))}
					{suggestions.length > 1 && (
						<Button
							ref={buttonRef}
							variant="ghost"
							size="sm"
							className="flex items-center gap-1"
							onClick={toggleExpand}
							aria-label={isExpanded ? "Show less suggestions" : "Show more suggestions"}>
							{isExpanded ? (
								<>
									<ChevronUp className="w-4 h-4" />
									Show Less
								</>
							) : (
								<>
									<ChevronDown className="w-4 h-4" />
									Show More ({suggestions.length - 1} more)
								</>
							)}
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}

export default FollowUpSuggest
