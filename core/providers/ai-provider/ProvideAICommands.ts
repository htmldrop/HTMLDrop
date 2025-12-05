import type { Request, Response, NextFunction } from 'express'
import registerPluginCommands from './commands/plugins.ts'
import registerThemeCommands from './commands/themes.ts'
import registerUserCommands from './commands/users.ts'
import registerOptionCommands from './commands/options.ts'
import registerSystemCommands from './commands/system.ts'
import registerDatabaseCommands from './commands/database.ts'
import registerJobCommands from './commands/jobs.ts'
import registerPostCommands from './commands/posts.ts'

interface ExtendedRequest extends Request {
  hooks: any
  context: HTMLDrop.Context
  user?: { locale?: string }
}

interface ProviderArgs {
  req: ExtendedRequest
  res: Response
  next: NextFunction
}

export default async ({ req }: ProviderArgs): Promise<void> => {
  const { registerAICommand } = req.hooks

  if (!registerAICommand) {
    console.warn('AI Commands registry not available')
    return
  }

  // Register all default commands
  registerPluginCommands(registerAICommand, req.context)
  registerThemeCommands(registerAICommand, req.context)
  registerUserCommands(registerAICommand, req.context)
  registerOptionCommands(registerAICommand, req.context)
  registerSystemCommands(registerAICommand, req.context)
  registerDatabaseCommands(registerAICommand, req.context)
  registerJobCommands(registerAICommand, req.context)
  registerPostCommands(registerAICommand, req.context)
}
