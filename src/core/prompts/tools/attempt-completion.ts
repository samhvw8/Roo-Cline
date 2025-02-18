import { ToolArgs } from "./types"

export function getAttemptCompletionDescription({ experiments }: ToolArgs): string {
	return `## attempt_completion
Description: After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you've received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user. Optionally you may provide a CLI command to showcase the result of your work. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.
IMPORTANT NOTE: This tool CANNOT be used until you've confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must ask yourself in <thinking></thinking> tags if you've confirmed from the user that any previous tool uses were successful. If not, then DO NOT use this tool.
Parameters:
- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.
- command: (optional) A CLI command to execute to show a live demo of the result to the user. For example, use \`open index.html\` to display a created html website, or \`open localhost:3000\` to display a locally running development server. But DO NOT use commands like \`echo\` or \`cat\` that merely print text. This command should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.${
		experiments?.["prompt_suggest"]
			? `
- values: (optional) A list of suggested prompt/task/question for user as XML elements. The order of suggestion is important, the order of suggestion is the same with the order that show to user.. Each suggested can have these elements:
	* suggest: A suggestion to display to the user. Each suggestion must be provided in its own <suggest> tag. Each suggestion can be multiple line.`
			: ``
	}
Usage:
<attempt_completion>
<result>
Your final result description here
</result>${
		experiments?.["prompt_suggest"]
			? `
<values>
<suggest>
- Suggested prompt or task 1
</suggest>
<suggest>
- Suggested prompt or task 2
</suggest>
</values>`
			: ``
	}
<command>Command to demonstrate result (optional)</command>
</attempt_completion>

Example: Requesting to attempt completion with a result and command
<attempt_completion>
<result>
I've updated the CSS
</result>
<command>open index.html</command>
</attempt_completion>${
		experiments?.["prompt_suggest"]
			? `

Example: Completion with suggestions after implementing a feature
<attempt_completion>
<result>
I've implemented the user authentication feature with email and password login
</result>
<values>
<suggest>
- Add unit tests for the authentication service
</suggest>
<suggest>
- Implement password reset functionality
</suggest>
<suggest>
- Add social login providers (Google, GitHub)
</suggest>
<suggest>
- Update API documentation with auth endpoints
</suggest>
</values>
<command>npm run dev</command>
</attempt_completion>

Example: Completion with suggestions after fixing a bug
<attempt_completion>
<result>
I've fixed the memory leak in the WebSocket connection handling
</result>
<values>
<suggest>
- Add monitoring for WebSocket connection counts
</suggest>
<suggest>
- Write regression tests to prevent future leaks
</suggest>
<suggest>
- Review other WebSocket usage for similar issues
</suggest>
<suggest>
- Document the fix in CHANGELOG.md
</suggest>
</values>
</attempt_completion>

Example: Completion with task split suggestions
<attempt_completion>
<result>
I've completed the initial database schema design
</result>
<values>
<suggest>
- Split into new task using new_task: Implement database migration system
</suggest>
<suggest>
- Split into new task using new_task: Create data access layer
</suggest>
<suggest>
- Document schema design decisions and constraints
</suggest>
<suggest>
- Review schema for optimization opportunities
</suggest>
</values>
</attempt_completion>

Example: Completion with documentation suggestions
<attempt_completion>
<result>
I've created the API endpoints for the user management system
</result>
<values>
<suggest>
- Create OpenAPI/Swagger documentation
</suggest>
<suggest>
- Write integration tests for all endpoints
</suggest>
<suggest>
- Add rate limiting and security headers
</suggest>
<suggest>
- Split into new task using new_task: Create user management API guide
</suggest>
</values>
<command>npm run docs</command>
</attempt_completion>`
			: ``
	}`
}
