import ProvidePostTypes from './ProvidePostTypes.mjs'

export default async ({ req, res, next }) => {
  await ProvidePostTypes({ req, res, next })
}
