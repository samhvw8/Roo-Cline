export const highlighter = {
	codeToHtml: jest.fn((code: string) => `<pre><code>${code}</code></pre>`),
	getLoadedThemes: jest.fn(() => []),
	loadTheme: jest.fn(),
}

export const getHighlighter = jest.fn(() => Promise.resolve(highlighter))
