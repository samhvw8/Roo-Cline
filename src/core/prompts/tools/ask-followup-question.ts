export function getAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Description: Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.
Parameters:
- question: (required) The question to ask the user. This should be a clear, specific question that addresses the information you need.
- follow_up: (required) A list of suggested answer for question that logically follow from the question. Each suggestion must:
  1. Be provided in its own <suggest> tag with two fields:
     - answer: The description of the suggested answer
  2. Be specific, actionable, and directly related to the completed task
  3. Be ordered by priority or logical sequence
  4. Provide minimum 2-4 suggestions and maximum 12 suggestions
Usage:
<ask_followup_question>
<question>Your question here</question>
<follow_up>
<suggest>
<answer>Your Suggested answer here</answer>
</suggest>
</follow_up>
</ask_followup_question>

Example: Requesting to ask the user for the path to the frontend-config.json file
<ask_followup_question>
<question>What is the path to the frontend-config.json file?</question>
<follow_up>
<suggest>
<answer>./src/frontend-config.json</answer>
</suggest>
<suggest>
<answer>./config/frontend-config.json</answer>
</suggest>
<suggest>
<answer>./frontend-config.json</answer>
</suggest>
</follow_up>
</ask_followup_question>`
}
