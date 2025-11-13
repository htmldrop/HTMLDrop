import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HTMLDrop CMS API',
      version: '1.0.0',
      description: 'A modern, extensible headless CMS built with Node.js',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      },
      contact: {
        name: 'CoralPen',
        url: 'https://github.com/htmldrop/htmldrop'
      }
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API v1'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        },
        Health: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy']
            },
            uptime: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  status: { type: 'string' },
                  message: { type: 'string' },
                  ok: { type: 'boolean' }
                }
              }
            }
          }
        },
        User: {
          type: 'object',
          description: 'User object with core fields and custom metadata. Custom metadata fields are merged at the root level alongside core fields. The password field is never returned in responses.',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            first_name: { type: 'string' },
            middle_name: { type: 'string' },
            last_name: { type: 'string' },
            picture: { type: 'string', description: 'Profile picture URL' },
            locale: { type: 'string', example: 'en_US' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            deleted_at: { type: 'string', format: 'date-time', nullable: true }
          },
          additionalProperties: true
        },
        Post: {
          type: 'object',
          description: 'Post object with core fields, custom metadata, and taxonomy relationships. Custom metadata fields are merged at the root level alongside core fields.',
          properties: {
            id: { type: 'integer' },
            post_type_slug: { type: 'string' },
            post_type_id: { type: 'integer' },
            slug: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'published', 'archived'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            deleted_at: { type: 'string', format: 'date-time', nullable: true },
            terms: {
              type: 'object',
              description: 'Taxonomy relationships grouped by taxonomy slug. Each taxonomy contains an array of term objects with their metadata.',
              additionalProperties: {
                type: 'array',
                items: {
                  allOf: [
                    { $ref: '#/components/schemas/Term' },
                    {
                      type: 'object',
                      properties: {
                        post_count: { type: 'integer', description: 'Number of posts using this term' }
                      },
                      description: 'Terms include their metadata fields and post count'
                    }
                  ]
                }
              },
              example: {
                categories: [
                  { id: 1, slug: 'technology', name: 'Technology', post_count: 15 }
                ],
                tags: [
                  { id: 5, slug: 'javascript', name: 'JavaScript', post_count: 42 },
                  { id: 8, slug: 'nodejs', name: 'Node.js', post_count: 28 }
                ]
              }
            }
          },
          additionalProperties: true
        },
        PostType: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            slug: { type: 'string' },
            label: { type: 'string' },
            plural_label: { type: 'string' },
            description: { type: 'string' },
            icon: { type: 'string' },
            capabilities: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Term: {
          type: 'object',
          description: 'Term object with core fields and custom metadata. Custom metadata fields are merged at the root level alongside core fields.',
          properties: {
            id: { type: 'integer' },
            taxonomy_slug: { type: 'string' },
            taxonomy_id: { type: 'integer' },
            slug: { type: 'string' },
            parent_id: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            deleted_at: { type: 'string', format: 'date-time', nullable: true }
          },
          additionalProperties: true
        },
        Taxonomy: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            slug: { type: 'string' },
            label: { type: 'string' },
            plural_label: { type: 'string' },
            description: { type: 'string' },
            hierarchical: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Option: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            value: { type: 'string' },
            autoload: { type: 'boolean' }
          }
        }
      }
    },
    tags: [
      { name: 'Health', description: 'System health and monitoring' },
      { name: 'Setup', description: 'Initial setup endpoints' },
      { name: 'Authentication', description: 'User authentication and authorization' },
      { name: 'OAuth', description: 'OAuth provider authentication' },
      { name: 'Users', description: 'User management' },
      { name: 'Posts', description: 'Content posts' },
      { name: 'Post Types', description: 'Post type management' },
      { name: 'Post Type Fields', description: 'Custom fields for post types' },
      { name: 'Terms', description: 'Taxonomy terms' },
      { name: 'Taxonomies', description: 'Taxonomy management' },
      { name: 'Taxonomy Fields', description: 'Custom fields for taxonomies' },
      { name: 'Options', description: 'Site options and settings' },
      { name: 'Plugins', description: 'Plugin management' },
      { name: 'Themes', description: 'Theme management' },
      { name: 'Dashboard', description: 'Admin dashboard data' },
      { name: 'Translations', description: 'Translation and localization' }
    ]
  },
  apis: ['./hd-core/controllers/v1/*.mjs']
}

export default swaggerJsdoc(options)
