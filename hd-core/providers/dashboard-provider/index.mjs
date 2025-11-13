import ProvideDashboardMenu from './ProvideDashboardMenu.mjs'
import ProvidePostTypes from './ProvidePostTypes.mjs'
import ProvideTaxonomies from './ProvideTaxonomies.mjs'
import ProvideControls from './ProvideControls.mjs'

export default async ({ req, res, next }) => {
  await ProvideDashboardMenu({ req, res, next })
  await ProvidePostTypes({ req, res, next })
  await ProvideTaxonomies({ req, res, next })
  await ProvideControls({ req, res, next })
}
