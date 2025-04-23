import { ToolArgs } from "./types"

export function getReadFileDescription(args: ToolArgs): string {
	return `## read_file
Description: Request to read the contents of one or more files. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. Use line ranges to efficiently read specific portions of large files. Supports text extraction from PDF and DOCX files, but may not handle other binary files properly.

Parameters:
- args (required): File read operations in the following format:
  :path: File path (relative to workspace directory ${args.cwd})
  :start_line: (optional) Starting line number (1-based)
  :end_line: (optional) Ending line number (1-based, inclusive)

Multiple files can be read in a single request by separating entries with "======+++======". Each entry follows the same format with its own path and optional line range.

Usage:
<read_file>
<args>
:path:path/to/file
:start_line:1
:end_line:100
</args>
</read_file>

Examples:

1. Reading a single file:
<read_file>
<args>
:path:src/app.ts
:start_line:1
:end_line:1000
</args>
</read_file>

2. Reading specific lines from multiple files:
<read_file>
<args>
:path:src/app.ts
:start_line:1
:end_line:1000
======+++======
:path:src/utils.ts
:start_line:10
:end_line:20
</args>
</read_file>

3. Reading an entire file (omitting line ranges):
<read_file>
<args>
:path:config.json
</args>
</read_file>

4. Reading multiple files with different ranges:
<read_file>
<args>
:path:src/app.ts
:start_line:1
:end_line:50
======+++======
:path:src/utils.ts
:start_line:100
:end_line:150
======+++======
:path:package.json
</args>
</read_file>

Note: Line ranges enable efficient streaming of specific portions from large files like logs or datasets.`
}
