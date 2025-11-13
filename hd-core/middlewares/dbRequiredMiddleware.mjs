export default (context) => (req, res, next) => {
  if (!context.knex) {
    return res.redirect('/api/v1/setup/database')
  }
  next()
}
