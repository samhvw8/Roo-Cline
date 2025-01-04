import crypto, { CipherGCM, DecipherGCM } from 'crypto'

interface EncryptionConfig {
  readonly ALGORITHM: string
  readonly IV_LENGTH: number
  readonly AUTH_TAG_LENGTH: number
  readonly SALT: Buffer
  readonly ITERATIONS: number
}

export class ConfigEncryption {
  private encryptionKey?: Buffer
  private encryptionEnabled: boolean = false
  private readonly config: EncryptionConfig

  constructor() {
    this.encryptionEnabled = false
    this.config = {
      ALGORITHM: 'aes-256-gcm',
      IV_LENGTH: 12,
      AUTH_TAG_LENGTH: 16,
      SALT: crypto.randomBytes(16),
      ITERATIONS: 100000
    }
  }

  isEnabled(): boolean {
    return this.encryptionEnabled
  }

  async setKey(password: string): Promise<void> {
    if (!password) {
      throw new Error('Password cannot be empty')
    }

    this.encryptionKey = crypto.pbkdf2Sync(
      password,
      this.config.SALT,
      this.config.ITERATIONS,
      32, // 32 bytes for AES-256
      'sha256'
    )
    this.encryptionEnabled = true
  }

  disable(): void {
    this.encryptionEnabled = false
    this.encryptionKey = undefined
  }

  encrypt(text: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set')
    }

    const iv = crypto.randomBytes(this.config.IV_LENGTH)
    const cipher = crypto.createCipheriv(
      this.config.ALGORITHM,
      this.encryptionKey,
      iv
    ) as CipherGCM

    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
  }

  decrypt(encryptedText: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not set')
    }

    // Validate base64 string
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encryptedText)) {
      throw new Error('Invalid base64 string')
    }

    const data = Buffer.from(encryptedText, 'base64')
    
    const iv = data.subarray(0, this.config.IV_LENGTH)
    const authTag = data.subarray(
      this.config.IV_LENGTH,
      this.config.IV_LENGTH + this.config.AUTH_TAG_LENGTH
    )
    const encrypted = data.subarray(
      this.config.IV_LENGTH + this.config.AUTH_TAG_LENGTH
    )

    const decipher = crypto.createDecipheriv(
      this.config.ALGORITHM,
      this.encryptionKey,
      iv
    ) as DecipherGCM

    decipher.setAuthTag(authTag)

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString('utf8')
  }
}