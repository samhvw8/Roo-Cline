export function getInsertCodeBlockDescription(cwd: string): string {
    return `## insert_code_block
Description: Inserts one or more lines of code starting at a specific line position (start line) in a file. This is primary tool for adding new code (adding new functions/methods/classes, adding imports, adding attributes etc.), it allows for precise insertion of code without overwriting the entire file. Beware to use the proper identation. This tool is the preferred way to add new code to files.
Parameters:
- path: (required) The path of the file to insert code into (relative to the current working directory ${cwd.toPosix()})
- start_line: (required) The line number where the code block should be inserted
- content: (required) The code block to insert at the specified position
Usage:
<insert_code_block>
<path>File path here</path>
<start_line>Line number</start_line>
<content>
Your code block here
</content>
</insert_code_block>

Example: Requesting to insert a new function at line 10
<insert_code_block>
<path>src/app.ts</path>
<start_line>10</start_line>
<content>
function calculateTotal(items: number[]): number {
    return items.reduce((sum, item) => sum + item, 0);
}
</content>
</insert_code_block>`
}