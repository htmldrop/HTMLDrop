/**
 * User System Types
 */

declare global {
  namespace HTMLDrop {
    interface User {
      id: number
      username: string
      email: string
      status?: string
      first_name?: string
      middle_name?: string
      last_name?: string
      picture?: string
      locale?: string
      phone?: string
      email_verified_at?: string
      phone_verified_at?: string
      created_at: string
      updated_at?: string
      deleted_at?: string
      meta?: Record<string, any>
      roles?: Role[]
    }

    interface Role {
      id: number
      slug: string
      name: string
      description: string
      capabilities?: Capability[]
    }

    interface Capability {
      id: number
      slug: string
      name: string
      description: string
    }

    interface Guard {
      user(options: GuardOptions): Promise<string[] | null>
    }

    interface GuardOptions {
      canOneOf?: Record<string, string> | string[]
      canAllOf?: Record<string, string> | string[]
      userId?: number
      postId?: number
      termId?: number
    }

    interface LoginResponse {
      access_token: string
      refresh_token: string
      user: User
    }

    interface TokenPayload {
      sub: number
      email: string
      locale?: string
      roles: string[]
      capabilities: string[]
      jti: string
      iat: number
      exp: number
    }
  }
}

export {}
