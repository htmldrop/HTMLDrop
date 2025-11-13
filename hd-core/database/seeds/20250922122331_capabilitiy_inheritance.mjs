export const seed = async (knex) => {
  const prefix = process.env.TABLE_PREFIX
  const tableName = `${prefix  }capability_inheritance`
  const seeds = [
    // Manage Post types
    { id: 1, parent_capability_id: 6, child_capability_id: 20 },
    { id: 2, parent_capability_id: 6, child_capability_id: 21 },
    { id: 3, parent_capability_id: 6, child_capability_id: 22 },
    { id: 4, parent_capability_id: 6, child_capability_id: 23 },
    { id: 5, parent_capability_id: 6, child_capability_id: 24 },

    // Manage Posts
    { id: 6, parent_capability_id: 7, child_capability_id: 25 },
    { id: 7, parent_capability_id: 7, child_capability_id: 26 },
    { id: 8, parent_capability_id: 7, child_capability_id: 27 },
    { id: 9, parent_capability_id: 7, child_capability_id: 28 },
    { id: 10, parent_capability_id: 7, child_capability_id: 29 },

    // Manage Pages
    { id: 11, parent_capability_id: 8, child_capability_id: 30 },
    { id: 12, parent_capability_id: 8, child_capability_id: 31 },
    { id: 13, parent_capability_id: 8, child_capability_id: 32 },
    { id: 14, parent_capability_id: 8, child_capability_id: 33 },
    { id: 15, parent_capability_id: 8, child_capability_id: 34 },

    // Manage Attachments
    { id: 16, parent_capability_id: 9, child_capability_id: 35 },
    { id: 17, parent_capability_id: 9, child_capability_id: 36 },
    { id: 18, parent_capability_id: 9, child_capability_id: 37 },
    { id: 19, parent_capability_id: 9, child_capability_id: 38 },
    { id: 20, parent_capability_id: 9, child_capability_id: 39 },

    // Manage Comments
    { id: 21, parent_capability_id: 10, child_capability_id: 40 },
    { id: 22, parent_capability_id: 10, child_capability_id: 41 },
    { id: 23, parent_capability_id: 10, child_capability_id: 42 },
    { id: 24, parent_capability_id: 10, child_capability_id: 43 },
    { id: 25, parent_capability_id: 10, child_capability_id: 44 },

    // Manage Options
    { id: 26, parent_capability_id: 11, child_capability_id: 45 },
    { id: 27, parent_capability_id: 11, child_capability_id: 46 },
    { id: 28, parent_capability_id: 11, child_capability_id: 47 },
    { id: 29, parent_capability_id: 11, child_capability_id: 48 },
    { id: 30, parent_capability_id: 11, child_capability_id: 49 },

    // Manage Users
    { id: 31, parent_capability_id: 12, child_capability_id: 50 },
    { id: 32, parent_capability_id: 12, child_capability_id: 51 },
    { id: 33, parent_capability_id: 12, child_capability_id: 52 },
    { id: 34, parent_capability_id: 12, child_capability_id: 53 },
    { id: 35, parent_capability_id: 12, child_capability_id: 54 },

    // Manage Taxonomies
    { id: 36, parent_capability_id: 13, child_capability_id: 55 },
    { id: 37, parent_capability_id: 13, child_capability_id: 56 },
    { id: 38, parent_capability_id: 13, child_capability_id: 57 },
    { id: 39, parent_capability_id: 13, child_capability_id: 58 },
    { id: 40, parent_capability_id: 13, child_capability_id: 59 },

    // Manage Terms
    { id: 41, parent_capability_id: 14, child_capability_id: 60 },
    { id: 42, parent_capability_id: 14, child_capability_id: 61 },
    { id: 43, parent_capability_id: 14, child_capability_id: 62 },
    { id: 44, parent_capability_id: 14, child_capability_id: 63 },
    { id: 45, parent_capability_id: 14, child_capability_id: 64 },

    // Manage Menus
    { id: 46, parent_capability_id: 15, child_capability_id: 65 },
    { id: 47, parent_capability_id: 15, child_capability_id: 66 },
    { id: 48, parent_capability_id: 15, child_capability_id: 67 },
    { id: 49, parent_capability_id: 15, child_capability_id: 68 },
    { id: 50, parent_capability_id: 15, child_capability_id: 69 },

    // Manage Plugins
    { id: 51, parent_capability_id: 16, child_capability_id: 70 },
    { id: 52, parent_capability_id: 16, child_capability_id: 71 },
    { id: 53, parent_capability_id: 16, child_capability_id: 72 },
    { id: 53, parent_capability_id: 16, child_capability_id: 73 },
    { id: 55, parent_capability_id: 16, child_capability_id: 74 },

    // Manage Themes
    { id: 56, parent_capability_id: 17, child_capability_id: 75 },
    { id: 57, parent_capability_id: 17, child_capability_id: 76 },
    { id: 58, parent_capability_id: 17, child_capability_id: 77 },
    { id: 59, parent_capability_id: 17, child_capability_id: 78 },
    { id: 60, parent_capability_id: 17, child_capability_id: 79 }
  ]

  for (const seed of seeds) {
    const record = await knex(tableName).where({ id: seed.id }).first()
    if (!record) {
      await knex(tableName).insert({ ...seed, created_at: knex.fn.now(), updated_at: knex.fn.now() })
    }
  }
}
