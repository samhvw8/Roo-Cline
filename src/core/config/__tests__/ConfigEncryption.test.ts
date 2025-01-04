import crypto from 'crypto'
import { ConfigEncryption } from '../ConfigEncryption'

jest.mock('crypto')

describe('ConfigEncryption', () => {
  let configEncryption: ConfigEncryption
  const mockKey = Buffer.from('0123456789abcdef0123456789abcdef')
  const mockIV = Buffer.from('012345678901')
  const mockAuthTag = Buffer.from('0123456789abcdef')
  const mockSalt = Buffer.from('0123456789abcdef')

  beforeEach(() => {
    jest.clearAllMocks()
    configEncryption = new ConfigEncryption()

    // Mock crypto methods
    ;(crypto.randomBytes as jest.Mock)
      .mockReturnValueOnce(mockSalt) // For SALT in ENCRYPTION_CONFIG
      .mockReturnValue(mockIV) // For subsequent calls (IV generation)
    ;(crypto.pbkdf2Sync as jest.Mock).mockReturnValue(mockKey)

    const mockCipher = {
      update: jest.fn().mockReturnValue(Buffer.from('encrypted')),
      final: jest.fn().mockReturnValue(Buffer.from('')),
      getAuthTag: jest.fn().mockReturnValue(mockAuthTag)
    }

    const mockDecipher = {
      update: jest.fn().mockReturnValue(Buffer.from('decrypted')),
      final: jest.fn().mockReturnValue(Buffer.from('')),
      setAuthTag: jest.fn()
    }

    ;(crypto.createCipheriv as jest.Mock).mockReturnValue(mockCipher)
    ;(crypto.createDecipheriv as jest.Mock).mockReturnValue(mockDecipher)
  })

  describe('constructor', () => {
    it('should initialize with encryption disabled', () => {
      expect(configEncryption.isEnabled()).toBe(false)
    })
  })

  describe('setKey', () => {
    it('should set encryption key and enable encryption', async () => {
      await configEncryption.setKey('password123')

      expect(configEncryption.isEnabled()).toBe(true)
      expect(crypto.pbkdf2Sync).toHaveBeenCalledWith(
        'password123',
        expect.any(Buffer),
        100000,
        32,
        'sha256'
      )
    })

    it('should throw error when setting empty password', async () => {
      await expect(configEncryption.setKey('')).rejects.toThrow('Password cannot be empty')
      expect(configEncryption.isEnabled()).toBe(false)
    })
  })

  describe('disable', () => {
    it('should disable encryption and clear key', async () => {
      await configEncryption.setKey('password123')
      expect(configEncryption.isEnabled()).toBe(true)

      configEncryption.disable()
      expect(configEncryption.isEnabled()).toBe(false)
    })
  })

  describe('encrypt', () => {
    it('should encrypt text correctly', async () => {
      await configEncryption.setKey('password123')

      const encrypted = configEncryption.encrypt('test data')

      expect(crypto.createCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        expect.any(Buffer),
        expect.any(Buffer)
      )
      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      // Verify base64 format
      expect(/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)).toBe(true)
    })

    it('should throw error when encrypting without key', () => {
      expect(() => configEncryption.encrypt('test')).toThrow('Encryption key not set')
    })
  })

  describe('decrypt', () => {
    it('should decrypt text correctly', async () => {
      await configEncryption.setKey('password123')

      // First encrypt some data
      const encrypted = configEncryption.encrypt('test data')
      // Then decrypt it
      const decrypted = configEncryption.decrypt(encrypted)

      expect(crypto.createDecipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        mockKey,
        expect.any(Buffer)
      )
      expect(decrypted).toBe('decrypted')
    })

    it('should throw error when decrypting without key', () => {
      expect(() => configEncryption.decrypt('test')).toThrow('Encryption key not set')
    })

    it('should throw error when decrypting invalid base64', async () => {
      await configEncryption.setKey('password123')
      expect(() => configEncryption.decrypt('!@#$%^')).toThrow()
    })

  })

  describe('encryption/decryption cycle', () => {
    it('should successfully encrypt and decrypt data', async () => {
      await configEncryption.setKey('password123')
      const originalText = 'test data'

      const encrypted = configEncryption.encrypt(originalText)
      expect(encrypted).not.toBe(originalText)
      expect(typeof encrypted).toBe('string')

      const decrypted = configEncryption.decrypt(encrypted)
      expect(decrypted).toBe('decrypted')
    })
  })
})