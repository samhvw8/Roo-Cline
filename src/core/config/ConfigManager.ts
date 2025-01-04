import fs from 'fs'
import path from 'path'
import os from 'os'
import { ApiConfiguration } from '../../shared/api'
import { ApiConfigMeta } from '../../shared/ExtensionMessage'
import { ConfigEncryption } from './ConfigEncryption'

export interface ApiConfigFile {
  currentApiConfigName: string
  apiConfigs: {
    [key: string]: ApiConfiguration
  }
}

export class ConfigManager {
  private readonly configPath: string
  private readonly encryption: ConfigEncryption
  private readonly defaultConfig: ApiConfigFile = {
    currentApiConfigName: 'default',
    apiConfigs: {
      default: {}
    }
  }
  private readonly initialized: Promise<void>

  constructor(configPath?: string, password?: string) {
    this.encryption = new ConfigEncryption()
    configPath = configPath ?? path.join(os.homedir(), '.cline')
    this.configPath = path.join(configPath, 'api-config.json')

    // Initialize config file if it doesn't exist and store the promise
    this.initialized = (async () => {
      try {
        await this.initConfig()
        
        // Set up encryption if password provided
        if (password) {
          await this.setEncryptionKey(password)
        }
      } catch (error) {
        throw new Error(`Failed to initialize config in constructor: ${error}`)
      }
    })()
  }

  /**
   * Initialize config file if it doesn't exist
   */
  async initConfig(): Promise<void> {
    try {
      // Create .cline directory if it doesn't exist
      const dirPath = path.dirname(this.configPath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      // Create config file with default values if it doesn't exist
      if (!fs.existsSync(this.configPath)) {
        await fs.promises.writeFile(
          this.configPath,
          JSON.stringify(this.defaultConfig, null, 2)
        )
      }
    } catch (error) {
      throw new Error(`Failed to initialize config: ${error}`)
    }
  }

  /**
   * List all available configs with metadata
   */
  async ListConfig(): Promise<ApiConfigMeta[]> {
    try {
      await this.initialized
      const config = await this.readConfig()
      return Object.entries(config.apiConfigs).map(([name, apiConfig]) => ({
        name,
        apiProvider: apiConfig.apiProvider,
      }))
    } catch (error) {
      throw new Error(`Failed to list configs: ${error}`)
    }
  }

  /**
   * Save a config with the given name
   */
  async SaveConfig(name: string, config: ApiConfiguration): Promise<void> {
    try {
      await this.initialized
      const currentConfig = await this.readConfig()
      // Update or add the new config
      currentConfig.apiConfigs[name] = config
      
      await this.writeConfig(currentConfig)
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`)
    }
  }

  /**
   * Load a config by name
   */
  async LoadConfig(name: string): Promise<ApiConfiguration> {
    try {
      await this.initialized
      const config = await this.readConfig()
      const apiConfig = config.apiConfigs[name]
      
      if (!apiConfig) {
        throw new Error(`Config '${name}' not found`)
      }
      
      config.currentApiConfigName = name;
      await this.writeConfig(config)
      
      return apiConfig
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`)
    }
  }

  /**
   * Delete a config by name
   */
  async DeleteConfig(name: string): Promise<void> {
    try {
      await this.initialized
      const currentConfig = await this.readConfig()
      if (!currentConfig.apiConfigs[name]) {
        throw new Error(`Config '${name}' not found`)
      }

      // Don't allow deleting the default config
      if (Object.keys(currentConfig.apiConfigs).length === 1) {
        throw new Error(`Cannot delete the last remaining configuration.`)
      }

      delete currentConfig.apiConfigs[name]

      await this.writeConfig(currentConfig)
    } catch (error) {
      throw new Error(`Failed to delete config: ${error}`)
    }
  }

  /**
   * Set the current active API configuration
   */
  async SetCurrentConfig(name: string): Promise<void> {
    try {
      await this.initialized
      const currentConfig = await this.readConfig()
      if (!currentConfig.apiConfigs[name]) {
        throw new Error(`Config '${name}' not found`)
      }

      currentConfig.currentApiConfigName = name
      
      await this.writeConfig(currentConfig)
    } catch (error) {
      throw new Error(`Failed to set current config: ${error}`)
    }
  }

  /**
   * Set encryption key from password
   * @param password Any string to use as encryption password
   */
  async setEncryptionKey(password: string): Promise<void> {
    await this.initialized
    
    // If encryption was previously enabled, decrypt existing config first
    if (this.encryption.isEnabled() && fs.existsSync(this.configPath)) {
      const config = await this.readConfig()
      this.encryption.disable()
      await this.writeConfig(config)
    }

    await this.encryption.setKey(password)
    
    // If config file exists, encrypt it
    if (fs.existsSync(this.configPath)) {
      const config = await this.readConfig()
      await this.writeConfig(config)
    }
  }

  /**
   * Disable encryption
   */
  async disableEncryption(): Promise<void> {
    await this.initialized
    
    // If encryption was enabled, decrypt existing config first
    if (this.encryption.isEnabled() && fs.existsSync(this.configPath)) {
      const config = await this.readConfig()
      this.encryption.disable()
      await this.writeConfig(config)
    }
  }

  private async readConfig(): Promise<ApiConfigFile> {
    try {
      const content = await fs.promises.readFile(this.configPath, 'utf-8')
      
      // Check if content is encrypted (base64 encoded)
      if (this.encryption.isEnabled() && /^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
        const decrypted = this.encryption.decrypt(content)
        return JSON.parse(decrypted)
      }
      
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to read config file: ${error}`)
    }
  }

  private async writeConfig(config: ApiConfigFile): Promise<void> {
    const content = JSON.stringify(config, null, 2)
    
    if (this.encryption.isEnabled()) {
      const encrypted = this.encryption.encrypt(content)
      await fs.promises.writeFile(this.configPath, encrypted)
    } else {
      await fs.promises.writeFile(this.configPath, content)
    }
  }
}