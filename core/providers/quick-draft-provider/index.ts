import ProvidePostTypes from './ProvidePostTypes.ts'
import type { Request, Response, NextFunction } from 'express'

interface ProviderRequest {
  req: Request & { hooks: any; context: any; user?: any; priority?: number }
  res: Response
  next: NextFunction
}

export default async ({ req, res, next }: ProviderRequest): Promise<void> => {
  await ProvidePostTypes({ req, res, next })
}
