export function formatPath(path: string, handleSpace: boolean = true): string {
	let formattedPath = path

	// Handle path prefix
	formattedPath = formattedPath.startsWith("/") ? formattedPath : `/${formattedPath}`

	// Handle space escaping
	if (handleSpace) {
		formattedPath = formattedPath.replaceAll(" ", "\\ ")
	}

	return formattedPath
}
