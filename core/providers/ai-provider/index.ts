import type { Request, Response, NextFunction } from 'express'
import ProvideAICommands from './ProvideAICommands.ts'

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

export default async ({ req, res, next }: ProviderArgs): Promise<void> => {
  await ProvideAICommands({ req, res, next })
}
