# OpenAPI Documentation

CoralPen uses OpenAPI 3.0 specification with Swagger UI to provide interactive API documentation.

## Accessing the Documentation

Once the server is running, you can access the API documentation at:

- **Swagger UI**: `http://localhost:3001/api/v1/docs`
- **OpenAPI JSON**: `http://localhost:3001/api/v1/openapi.json`

## Adding Documentation to Controllers

To document an endpoint, add JSDoc comments with `@openapi` annotations above the route handler.

### Example: Basic GET Endpoint

```javascript
/**
 * @openapi
 * /users:
 *   get:
 *     tags:
 *       - Users
 *     summary: List all users
 *     description: Returns a paginated list of all users in the system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', jwtMiddleware(context), async (req, res) => {
  // Handler implementation
})
```

### Example: POST Endpoint with Request Body

```javascript
/**
 * @openapi
 * /posts:
 *   post:
 *     tags:
 *       - Posts
 *     summary: Create a new post
 *     description: Creates a new post with the provided data
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - post_type_slug
 *             properties:
 *               title:
 *                 type: string
 *                 example: "My First Post"
 *               slug:
 *                 type: string
 *                 example: "my-first-post"
 *               post_type_slug:
 *                 type: string
 *                 example: "posts"
 *               content:
 *                 type: string
 *                 example: "This is the post content"
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 default: draft
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 */
router.post('/', jwtMiddleware(context), async (req, res) => {
  // Handler implementation
})
```

### Example: Path Parameters

```javascript
/**
 * @openapi
 * /posts/{id}:
 *   get:
 *     tags:
 *       - Posts
 *     summary: Get a post by ID
 *     description: Returns a single post by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', jwtMiddleware(context), async (req, res) => {
  // Handler implementation
})
```

### Example: DELETE Endpoint

```javascript
/**
 * @openapi
 * /posts/{id}:
 *   delete:
 *     tags:
 *       - Posts
 *     summary: Delete a post
 *     description: Permanently deletes a post by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post deleted successfully
 *       404:
 *         description: Post not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.delete('/:id', jwtMiddleware(context), async (req, res) => {
  // Handler implementation
})
```

## Available Tags

The following tags are predefined in the OpenAPI specification:

- **Health** - System health and monitoring
- **Setup** - Initial setup endpoints
- **Authentication** - User authentication and authorization
- **OAuth** - OAuth provider authentication
- **Users** - User management
- **Posts** - Content posts
- **Post Types** - Post type management
- **Post Type Fields** - Custom fields for post types
- **Terms** - Taxonomy terms
- **Taxonomies** - Taxonomy management
- **Taxonomy Fields** - Custom fields for taxonomies
- **Options** - Site options and settings
- **Plugins** - Plugin management
- **Themes** - Theme management
- **Dashboard** - Admin dashboard data
- **Translations** - Translation and localization

## Available Schemas

The following schemas are predefined and can be referenced using `$ref`:

- `#/components/schemas/User`
- `#/components/schemas/Post`
- `#/components/schemas/PostType`
- `#/components/schemas/Term`
- `#/components/schemas/Taxonomy`
- `#/components/schemas/Option`
- `#/components/schemas/Health`
- `#/components/schemas/Error`

## Security

To mark an endpoint as requiring authentication, add the `security` field:

```yaml
security:
  - bearerAuth: []
```

This indicates that the endpoint requires a JWT bearer token in the `Authorization` header.

## Best Practices

1. **Always include a summary** - Brief one-line description of what the endpoint does
2. **Add descriptions** - More detailed explanation of the endpoint's purpose
3. **Document all parameters** - Include query params, path params, and request body
4. **List all possible responses** - Include success and error responses with appropriate status codes
5. **Use schema references** - Reference predefined schemas when possible for consistency
6. **Include examples** - Provide example values to make the API easier to understand
7. **Tag appropriately** - Use the predefined tags to organize endpoints logically

## Configuration

The OpenAPI configuration is located in `/core/config/swagger.mjs`. You can customize:

- API information (title, version, description)
- Server URLs
- Security schemes
- Component schemas
- Tags

## Next Steps

To fully document the API:

1. Add OpenAPI annotations to all controller files in `/core/controllers/v1/`
2. Update schemas in `/core/config/swagger.mjs` as needed
3. Test the documentation by visiting `/api/v1/docs`
4. Export the OpenAPI spec from `/api/v1/openapi.json` for use with other tools

## Additional Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/docs/open-source-tools/swagger-ui/)
- [swagger-jsdoc Documentation](https://github.com/Surnet/swagger-jsdoc)
