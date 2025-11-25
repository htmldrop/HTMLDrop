export default class UserGuard {
  constructor(context, userId = null, req, res, next) {
    this.context = context
    this.table = context.table
    this.resolvedCapabilities = new Set()
    this.userId = userId
    this.postCapsCache = new Map()
    this.termCapsCache = new Map()
  }

  async user({ canOneOf = {}, canAllOf = {}, userId = this.userId, postId = null, termId = null }) {
    if (!userId) userId = null

    if (userId && (this.userId !== userId || !this.resolvedCapabilities.size)) {
      this.resolvedCapabilities = await this.resolveUserCapabilities(userId)
      this.userId = userId
    }

    const effectiveCaps = new Set(this.resolvedCapabilities)

    if (postId) {
      let postCaps
      if (this.postCapsCache.has(postId)) {
        postCaps = this.postCapsCache.get(postId)
      } else {
        postCaps = await this.resolvePostCapabilities(userId, postId)
        this.postCapsCache.set(postId, postCaps)
      }
      for (const cap of postCaps) effectiveCaps.add(cap)
    }

    if (termId) {
      let termCaps
      if (this.termCapsCache.has(termId)) {
        termCaps = this.termCapsCache.get(termId)
      } else {
        termCaps = await this.resolveTermCapabilities(userId, termId)
        this.termCapsCache.set(termId, termCaps)
      }
      for (const cap of termCaps) effectiveCaps.add(cap)
    }

    const matchedCaps = []

    // All-of check
    for (const [canonical, mapped] of Object.entries(canAllOf)) {
      if (!effectiveCaps.has(mapped)) return null
      matchedCaps.push(canonical)
    }

    // One-of check
    if (Object.keys(canOneOf).length) {
      const found = Object.entries(canOneOf).filter(([canonical, mapped]) => effectiveCaps.has(mapped))
      if (!found.length) return null
      for (const [canonical] of found) matchedCaps.push(canonical)
    }

    return matchedCaps.length ? matchedCaps : null
  }

  async resolvePostCapabilities(userId, postId) {
    if (!userId) return []
    const table = this.table

    const row = await this.context
      .knex(table('post_permissions'))
      .where({ post_id: postId, user_id: userId })
      .first('capabilities')

    const caps = row?.capabilities ? JSON.parse(row.capabilities) : []
    return this.resolveInheritedCaps(caps)
  }

  async resolveTermCapabilities(userId, termId) {
    if (!userId) return []
    const table = this.table

    const row = await this.context
      .knex(table('term_permissions'))
      .where({ term_id: termId, user_id: userId })
      .first('capabilities')

    const caps = row?.capabilities ? JSON.parse(row.capabilities) : []
    return this.resolveInheritedCaps(caps)
  }

  async resolveInheritedCaps(caps) {
    // Fetch all inheritance relationships
    const inheritanceRows = await this.context
      .knex(this.table('capability_inheritance'))
      .join(
        `${this.table('capabilities')  } as parent`,
        `${this.table('capability_inheritance')  }.parent_capability_id`,
        'parent.id'
      )
      .join(
        `${this.table('capabilities')  } as child`,
        `${this.table('capability_inheritance')  }.child_capability_id`,
        'child.id'
      )
      .select('parent.slug as parent', 'child.slug as child')

    const inheritanceMap = {}
    inheritanceRows.forEach((r) => {
      if (!inheritanceMap[r.parent]) inheritanceMap[r.parent] = []
      inheritanceMap[r.parent].push(r.child)
    })

    // Resolve inheritance
    const resolvedCaps = new Set()
    const queue = [...caps]
    while (queue.length > 0) {
      const cap = queue.shift()
      if (resolvedCaps.has(cap)) continue
      resolvedCaps.add(cap)
      if (inheritanceMap[cap]) queue.push(...inheritanceMap[cap])
    }

    return resolvedCaps
  }

  async resolveUserCapabilities(userId) {
    const table = this.table
    let allCaps = []

    if (userId) {
      // Direct user capabilities
      const directCaps = await this.context
        .knex(table('user_capabilities'))
        .join(table('capabilities'), `${table('user_capabilities')  }.capability_id`, `${table('capabilities')  }.id`)
        .where(`${table('user_capabilities')  }.user_id`, userId)
        .pluck(`${table('capabilities')  }.slug`)

      // Role-based capabilities
      const roleCaps = await this.context
        .knex(table('user_roles'))
        .join(table('role_capabilities'), `${table('user_roles')  }.role_id`, `${table('role_capabilities')  }.role_id`)
        .join(table('capabilities'), `${table('role_capabilities')  }.capability_id`, `${table('capabilities')  }.id`)
        .where(`${table('user_roles')  }.user_id`, userId)
        .pluck(`${table('capabilities')  }.slug`)

      allCaps = [...new Set([...directCaps, ...roleCaps])]
    } else {
      // Guest capabilities
      const guestRole = await this.context.knex(table('roles')).where('slug', 'guest').first()

      if (guestRole) {
        const guestCaps = await this.context
          .knex(table('role_capabilities'))
          .where('role_id', guestRole.id)
          .join(table('capabilities'), `${table('capabilities')  }.id`, `${table('role_capabilities')  }.capability_id`)
          .pluck(`${table('capabilities')  }.slug`)
        allCaps = guestCaps
      }
    }

    // Fetch all inheritance relationships
    const inheritanceRows = await this.context
      .knex(table('capability_inheritance'))
      .join(
        `${table('capabilities')  } as parent`,
        `${table('capability_inheritance')  }.parent_capability_id`,
        'parent.id'
      )
      .join(`${table('capabilities')  } as child`, `${table('capability_inheritance')  }.child_capability_id`, 'child.id')
      .select('parent.slug as parent', 'child.slug as child')

    const inheritanceMap = {}
    inheritanceRows.forEach((r) => {
      if (!inheritanceMap[r.parent]) inheritanceMap[r.parent] = []
      inheritanceMap[r.parent].push(r.child)
    })

    // Resolve inheritance
    const resolvedCaps = new Set()
    const queue = [...allCaps]
    while (queue.length > 0) {
      const cap = queue.shift()
      if (resolvedCaps.has(cap)) continue
      resolvedCaps.add(cap)
      if (inheritanceMap[cap]) queue.push(...inheritanceMap[cap])
    }

    return resolvedCaps
  }
}
