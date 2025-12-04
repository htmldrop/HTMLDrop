import ProvideDashboardMenu from './ProvideDashboardMenu.ts'
import ProvidePostTypes from './ProvidePostTypes.ts'
import ProvideTaxonomies from './ProvideTaxonomies.ts'
import ProvideControls from './ProvideControls.ts'
import type { Request, Response, NextFunction } from 'express'

interface ProviderRequest {
  req: Request & { hooks: any; context: any; user?: any; priority?: number }
  res: Response
  next: NextFunction
}

export default async ({ req, res, next }: ProviderRequest): Promise<void> => {
  await ProvideDashboardMenu({ req, res, next })
  await ProvidePostTypes({ req, res, next })
  await ProvideTaxonomies({ req, res, next })
  await ProvideControls({ req, res, next })
}
