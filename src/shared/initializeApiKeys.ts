import { ApiConfiguration } from "./api"

type ApiKeyProperty = keyof ApiConfiguration & `${string}ApiKey`

/**
 * Initializes undefined API keys in the configuration with empty strings.
 * This ensures all API key properties have a defined value before being used in API handlers.
 *
 * @param apiConfiguration - The API configuration object to initialize
 * @returns The API configuration with all API keys initialized
 */
export function initializeApiKeys(apiConfiguration: ApiConfiguration): ApiConfiguration {
	const config = { ...apiConfiguration }

	for (const key in config) {
		if (
			key.endsWith("ApiKey") &&
			(key as ApiKeyProperty) in config &&
			config[key as ApiKeyProperty] === undefined
		) {
			config[key as ApiKeyProperty] = ""
		}
	}

	return config
}
