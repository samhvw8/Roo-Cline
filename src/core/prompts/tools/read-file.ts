import { ToolArgs } from "./types"

export function getReadFileDescription(args: ToolArgs): string {
	const maxConcurrentReads = args.settings?.maxConcurrentFileReads ?? 15
	const isMultipleReadsEnabled = maxConcurrentReads > 1

	return `## read_file
Description: Request to read the contents of ${isMultipleReadsEnabled ? "one or more files" : "a file"}. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. Use line ranges to efficiently read specific portions of large files. Supports text extraction from PDF and DOCX files, but may not handle other binary files properly.

${isMultipleReadsEnabled ? `**IMPORTANT: You can read a maximum of ${maxConcurrentReads} files in a single request.** If you need to read more files, use multiple sequential read_file requests.` : "**IMPORTANT: Multiple file reads are currently disabled. You can only read one file at a time.**"}

${
	args.partialReadsEnabled
		? `By specifying line_range xml tag parameter, you can efficiently read specific portions of large files without loading the entire file into memory.

IMPORTANT: Leverage line information from other tools:
- codebase_search returns results with "Lines: startLine-endLine" for each match
- search_files shows matches with line numbers (e.g., "42 | matched text")
- list_code_definition_names shows file headers and definitions with line ranges (e.g., "# filename.ts" followed by "3--24 | export function getName")

When these tools identify relevant code sections, use their line numbers with read_file's line_range parameter to:
1. Read only the specific code sections you need to understand or modify
2. Include sufficient context around the identified lines (typically 5-10 lines before/after)
3. Avoid reading entire large files when only specific sections are relevant

Example workflow:
1. Use search tools to find relevant code locations:
   - codebase_search: Note "Lines: 100-150" from results
   - search_files: Note line numbers like "42" from "42 | matched text"
   - list_code_definition_names: Note ranges like "3--24" from definition listings
2. Convert to line_range format for read_file:
   - For single lines, expand with context: line 42 → line_range "35-50"
   - For ranges, optionally expand: "3--24" → line_range "1-30"
3. Use read_file with calculated line_range to read specific sections`
		: ""
}
Parameters:
- args: Contains one or more file elements, where each file contains:
  - path: (required) File path (relative to workspace directory ${args.cwd})
  ${args.partialReadsEnabled ? `- line_range: (optional) One or more line range elements in format "start-end" (1-based, inclusive)` : ""}

Usage:
<read_file>
<args>
  <file>
    <path>path/to/file</path>
    ${args.partialReadsEnabled ? `<line_range>start-end</line_range>` : ""}
  </file>
</args>
</read_file>

Examples:

1. Reading a single file with one line range:
<read_file>
<args>
  <file>
    <path>src/app.ts</path>
    ${args.partialReadsEnabled ? `<line_range>1-1000</line_range>` : ""}
  </file>
</args>
</read_file>

${isMultipleReadsEnabled ? `2. Reading multiple files with different line ranges (within the ${maxConcurrentReads}-file limit):` : ""}${
		isMultipleReadsEnabled
			? `
<read_file>
<args>
  <file>
    <path>src/app.ts</path>
    ${
		args.partialReadsEnabled
			? `<line_range>1-50</line_range>
    <line_range>100-150</line_range>`
			: ""
	}
  </file>
  <file>
    <path>src/utils.ts</path>
    ${args.partialReadsEnabled ? `<line_range>10-20</line_range>` : ""}
  </file>
</args>
</read_file>`
			: ""
	}

${isMultipleReadsEnabled ? "3. " : "2. "}Reading an entire file (omitting line ranges):
<read_file>
<args>
  <file>
    <path>config.json</path>
  </file>
</args>
</read_file>

IMPORTANT: You MUST use this Efficient Reading Strategy:
- ${isMultipleReadsEnabled ? `You MUST read all related files and implementations together in a single operation (up to ${maxConcurrentReads} files at once)` : "You MUST read files one at a time, as multiple file reads are currently disabled"}
- You MUST obtain all necessary context before proceeding with changes
${
	args.partialReadsEnabled
		? `- You MUST use line ranges to read specific portions of large files, rather than reading entire files when not needed
- You MUST combine adjacent line ranges (<10 lines apart)
- You MUST use multiple ranges for content separated by >10 lines
- You MUST include sufficient line context for planned modifications while keeping ranges minimal
`
		: ""
}
${isMultipleReadsEnabled ? `- When you need to read more than ${maxConcurrentReads} files, prioritize the most critical files first, then use subsequent read_file requests for additional files` : ""}`
}
