# CoralPen CMS - API Reference

Complete REST API documentation for CoralPen CMS v1.0.

> **💡 Interactive Documentation**:
> - **Redoc** (Recommended): **[http://localhost:3001/api/v1/docs](http://localhost:3001/api/v1/docs)** - Clean 3-column layout with navigation, docs, and examples
> - **Swagger UI**: **[http://localhost:3001/api/v1/docs/swagger](http://localhost:3001/api/v1/docs/swagger)** - Traditional Swagger interface for testing endpoints
>
> **📄 OpenAPI Spec**: Download the OpenAPI 3.0 specification at **[http://localhost:3001/api/v1/openapi.json](http://localhost:3001/api/v1/openapi.json)**
>
> **📖 Adding Documentation**: See [OPENAPI.md](./OPENAPI.md) for instructions on documenting new endpoints.

## Base URL

```
http://localhost:3001/api/v1
```

## Authentication

Most endpoints require JWT authentication. Include the access token in the Authorization header:

```bash
Authorization: Bearer <access_token>
```

### Token Lifecycle
- **Access tokens**: 1 hour expiry (default)
- **Refresh tokens**: 7 days expiry (default)
- Use `/api/v1/auth/refresh` to get new access tokens

---

## Table of Contents

- [Authentication](#authentication-endpoints)
- [Posts](#posts-endpoints)
- [Post Types](#post-types-endpoints)
- [Post Type Fields](#post-type-fields-endpoints)
- [Taxonomies](#taxonomies-endpoints)
- [Terms](#terms-endpoints)
- [Users](#users-endpoints)
- [Plugins](#plugins-endpoints)
- [Themes](#themes-endpoints)
- [Options](#options-endpoints)
- [Dashboard](#dashboard-endpoints)
- [Translations](#translations-endpoints)
- [Setup](#setup-endpoints)

---

## Authentication Endpoints

### Login

Authenticate user and receive JWT tokens.

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "John Doe"
  }
}
```

**Errors:**
- `401 Unauthorized` - Invalid credentials
- `400 Bad Request` - Missing email or password

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password123"}'
```

---

### Register

Create a new user account.

**Endpoint:** `POST /api/v1/auth/register`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "display_name": "Jane Smith"
}
```

**Response:** `201 Created`
```json
{
  "id": 2,
  "email": "newuser@example.com",
  "display_name": "Jane Smith",
  "created_at": "2025-11-11T10:00:00.000Z"
}
```

**Errors:**
- `409 Conflict` - Email already exists
- `400 Bad Request` - Invalid input

---

### Refresh Token

Get a new access token using refresh token.

**Endpoint:** `POST /api/v1/auth/refresh`

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- `401 Unauthorized` - Invalid or expired refresh token

---

### Logout

Revoke access and refresh tokens.

**Endpoint:** `POST /api/v1/auth/logout`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

## Posts Endpoints

Posts endpoints are dynamic and work with any registered post type. Replace `:postType` with the post type slug (e.g., `posts`, `pages`, `products`).

### List Posts

Get a paginated list of posts with filtering, searching, and sorting.

**Endpoint:** `GET /api/v1/:postType`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `status` | string | Filter by status: `draft`, `published`, `pending`, `private` | - |
| `limit` | integer | Number of items per page | `10` |
| `offset` | integer | Number of items to skip | `0` |
| `orderBy` | string | Field to sort by (e.g., `id`, `created_at`, `title`) | `id` |
| `sort` | string | Sort direction: `asc` or `desc` | `desc` |
| `search` | string | Search query (searches in searchable fields) | - |
| `searchable` | string | JSON array of fields to search (e.g., `["title", "slug"]`) | `["title"]` |
| `filters` | string | JSON object of core field filters | - |
| `meta_query` | string | JSON object for meta field queries (see below) | - |
| `taxonomy_query` | string | JSON object for taxonomy filters (see below) | - |
| `trashed` | boolean | Include trashed items | `false` |

**Meta Query Syntax:**
```json
{
  "relation": "AND",
  "queries": [
    {
      "key": "field_slug",
      "value": "some_value",
      "compare": "="
    }
  ]
}
```

**Comparison Operators:**
- `=` - Equals
- `!=` - Not equals
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal
- `LIKE` - SQL LIKE pattern matching
- `IN` - Value in array
- `NOT IN` - Value not in array

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "post_type": "posts",
      "slug": "hello-world",
      "title": "Hello World",
      "content": "Welcome to HTMLDrop CMS",
      "excerpt": "Welcome to HTMLDrop CMS",
      "status": "published",
      "created_at": "2025-11-11T10:00:00.000Z",
      "updated_at": "2025-11-11T10:00:00.000Z",
      "meta": {
        "custom_field": "value"
      },
      "authors": [
        {
          "id": 1,
          "display_name": "John Doe"
        }
      ],
      "taxonomies": {
        "categories": [
          {
            "id": 1,
            "name": "News",
            "slug": "news"
          }
        ]
      }
    }
  ],
  "total": 100,
  "total_current": 50,
  "total_drafts": 20,
  "total_published": 70,
  "total_trashed": 10,
  "limit": 10,
  "offset": 0
}
```

**Example:**
```bash
# Get published posts with search
curl -X GET "http://localhost:3000/api/v1/posts?status=published&search=hello&limit=20" \
  -H "Authorization: Bearer <access_token>"

# Get posts with meta query
curl -X GET "http://localhost:3000/api/v1/posts?meta_query=%7B%22relation%22%3A%22AND%22%2C%22queries%22%3A%5B%7B%22key%22%3A%22featured%22%2C%22value%22%3A%22true%22%2C%22compare%22%3A%22%3D%22%7D%5D%7D" \
  -H "Authorization: Bearer <access_token>"
```

---

### Get Single Post

Get a specific post by ID or slug.

**Endpoint:** `GET /api/v1/:postType/:idOrSlug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "post_type": "posts",
  "slug": "hello-world",
  "title": "Hello World",
  "content": "Welcome to HTMLDrop CMS",
  "excerpt": "Welcome to HTMLDrop CMS",
  "status": "published",
  "created_at": "2025-11-11T10:00:00.000Z",
  "updated_at": "2025-11-11T10:00:00.000Z",
  "meta": {
    "custom_field": "value"
  },
  "authors": [
    {
      "id": 1,
      "display_name": "John Doe",
      "email": "john@example.com"
    }
  ],
  "taxonomies": {
    "categories": [
      {
        "id": 1,
        "name": "News",
        "slug": "news"
      }
    ]
  }
}
```

**Errors:**
- `404 Not Found` - Post does not exist
- `403 Forbidden` - No permission to view

**Example:**
```bash
curl -X GET http://localhost:3000/api/v1/posts/hello-world \
  -H "Authorization: Bearer <access_token>"
```

---

### Create Post

Create a new post.

**Endpoint:** `POST /api/v1/:postType`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "title": "New Post Title",
  "slug": "new-post-title",
  "content": "Post content here...",
  "excerpt": "Short excerpt",
  "status": "draft",
  "meta": {
    "custom_field": "value",
    "another_field": "another value"
  },
  "taxonomies": {
    "categories": [1, 2],
    "tags": ["tag1", "tag2"]
  }
}
```

**Response:** `201 Created`
```json
{
  "id": 5,
  "post_type": "posts",
  "slug": "new-post-title",
  "title": "New Post Title",
  "content": "Post content here...",
  "status": "draft",
  "created_at": "2025-11-11T11:00:00.000Z",
  "updated_at": "2025-11-11T11:00:00.000Z",
  "meta": {
    "custom_field": "value"
  }
}
```

**Errors:**
- `403 Forbidden` - No permission to create
- `409 Conflict` - Slug already exists
- `400 Bad Request` - Invalid input

**Required Capabilities:** `create_{postType}` (e.g., `create_posts`)

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/posts \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Post",
    "content": "This is the content",
    "status": "published"
  }'
```

---

### Update Post

Update an existing post.

**Endpoint:** `PATCH /api/v1/:postType/:idOrSlug`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:** (all fields optional)
```json
{
  "title": "Updated Title",
  "content": "Updated content",
  "status": "published",
  "meta": {
    "custom_field": "new value"
  }
}
```

**Response:** `200 OK`
```json
{
  "id": 5,
  "title": "Updated Title",
  "content": "Updated content",
  "status": "published",
  "updated_at": "2025-11-11T12:00:00.000Z"
}
```

**Errors:**
- `404 Not Found` - Post does not exist
- `403 Forbidden` - No permission to edit
- `400 Bad Request` - Invalid input

**Required Capabilities:** `edit_{postType}` or `edit_others_{postType}`

**Example:**
```bash
curl -X PATCH http://localhost:3000/api/v1/posts/5 \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "published"}'
```

---

### Delete Post

Delete or trash a post.

**Endpoint:** `DELETE /api/v1/:postType/:idOrSlug`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `permanent=true` - Permanently delete (skip trash)

**Response:** `200 OK`
```json
{
  "message": "Post moved to trash"
}
```

**Errors:**
- `404 Not Found` - Post does not exist
- `403 Forbidden` - No permission to delete

**Required Capabilities:** `delete_{postType}` or `delete_others_{postType}`

**Example:**
```bash
# Move to trash
curl -X DELETE http://localhost:3000/api/v1/posts/5 \
  -H "Authorization: Bearer <access_token>"

# Permanently delete
curl -X DELETE "http://localhost:3000/api/v1/posts/5?permanent=true" \
  -H "Authorization: Bearer <access_token>"
```

---

### Upload File

Upload a file attachment to a post.

**Endpoint:** `POST /api/v1/:postType/upload`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: multipart/form-data`

**Request Body:** (multipart form data)
- `file` - The file to upload
- `post_id` (optional) - Associate with specific post
- `title` (optional) - File title
- `alt` (optional) - Alt text for images

**Response:** `201 Created`
```json
{
  "id": 10,
  "post_type": "attachments",
  "title": "image.jpg",
  "slug": "image-jpg",
  "mime_type": "image/jpeg",
  "file_size": 154820,
  "url": "/uploads/2025/11/image.jpg",
  "meta": {
    "width": 1920,
    "height": 1080,
    "alt": "Description"
  }
}
```

**Supported File Types:**
- Images: jpg, jpeg, png, gif, webp, svg
- Documents: pdf, doc, docx, txt
- Archives: zip

**Max File Size:** Configured via `MAX_FILE_SIZE` environment variable

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/attachments/upload \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@/path/to/image.jpg" \
  -F "title=My Image" \
  -F "alt=Image description"
```

---

### Upload to Post Field

Upload a file directly to a post's field.

**Endpoint:** `POST /api/v1/:postType/upload/:id/:field`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: multipart/form-data`

**Request Body:** (multipart form data)
- `file` - The file to upload

**Response:** `200 OK`
```json
{
  "url": "/uploads/2025/11/image.jpg",
  "id": 10
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/v1/posts/upload/5/featured_image \
  -H "Authorization: Bearer <access_token>" \
  -F "file=@/path/to/image.jpg"
```

---

## Post Types Endpoints

### List Post Types

Get all registered post types.

**Endpoint:** `GET /api/v1/post-types`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "slug": "posts",
    "name_singular": "Post",
    "name_plural": "Posts",
    "description": "Blog posts",
    "show_in_menu": true,
    "icon": "<svg>...</svg>",
    "capabilities": {
      "create": "create_posts",
      "read": "read_posts",
      "edit": "edit_posts",
      "delete": "delete_posts"
    },
    "created_at": "2025-11-11T10:00:00.000Z"
  }
]
```

**Example:**
```bash
curl -X GET http://localhost:3000/api/v1/post-types \
  -H "Authorization: Bearer <access_token>"
```

---

### Get Post Type

Get a specific post type by slug.

**Endpoint:** `GET /api/v1/post-types/:slug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "slug": "posts",
  "name_singular": "Post",
  "name_plural": "Posts",
  "description": "Blog posts",
  "show_in_menu": true,
  "icon": "<svg>...</svg>",
  "capabilities": {
    "create": "create_posts",
    "read": "read_posts",
    "edit": "edit_posts",
    "delete": "delete_posts"
  }
}
```

---

### Create Post Type

Register a new custom post type.

**Endpoint:** `POST /api/v1/post-types`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "slug": "products",
  "name_singular": "Product",
  "name_plural": "Products",
  "description": "E-commerce products",
  "show_in_menu": true,
  "icon": "<svg>...</svg>",
  "capabilities": {
    "create": "create_products",
    "read": "read_products",
    "edit": "edit_products",
    "delete": "delete_products"
  }
}
```

**Response:** `201 Created`

**Required Capabilities:** `manage_post_types`

---

### Update Post Type

Update an existing post type.

**Endpoint:** `PATCH /api/v1/post-types/:slug`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:** (all fields optional)
```json
{
  "name_singular": "Updated Name",
  "description": "Updated description"
}
```

**Response:** `200 OK`

**Required Capabilities:** `manage_post_types`

---

### Delete Post Type

Delete a custom post type.

**Endpoint:** `DELETE /api/v1/post-types/:slug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

**Required Capabilities:** `manage_post_types`

---

## Post Type Fields Endpoints

### List Fields

Get all fields for a post type.

**Endpoint:** `GET /api/v1/:postType/fields`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "post_type_slug": "posts",
    "slug": "featured_image",
    "label": "Featured Image",
    "type": "image",
    "description": "Main image for the post",
    "default_value": null,
    "required": false,
    "options": {},
    "priority": 10
  }
]
```

**Field Types:**
- `text` - Single line text
- `textarea` - Multi-line text
- `rich_text` - WYSIWYG editor
- `number` - Numeric input
- `checkbox` - Boolean checkbox
- `select` - Dropdown selection
- `radio` - Radio buttons
- `image` - Image upload
- `file` - File upload
- `date` - Date picker
- `datetime` - Date and time picker
- `repeater` - Repeatable field group
- `relationship` - Post relationship

---

### Create Field

Add a new field to a post type.

**Endpoint:** `POST /api/v1/:postType/fields`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "slug": "price",
  "label": "Price",
  "type": "number",
  "description": "Product price",
  "default_value": "0",
  "required": true,
  "options": {
    "min": 0,
    "step": 0.01
  },
  "priority": 10
}
```

**Response:** `201 Created`

**Required Capabilities:** `manage_post_types`

---

### Update Field

Update an existing field.

**Endpoint:** `PATCH /api/v1/:postType/fields/:slug`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:** (all fields optional)
```json
{
  "label": "Updated Label",
  "required": false
}
```

**Response:** `200 OK`

---

### Delete Field

Delete a field from a post type.

**Endpoint:** `DELETE /api/v1/:postType/fields/:slug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

**Required Capabilities:** `manage_post_types`

---

## Taxonomies Endpoints

### List Taxonomies

Get all taxonomies for a post type.

**Endpoint:** `GET /api/v1/:postType/taxonomies`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "post_type_slug": "posts",
    "slug": "categories",
    "name_singular": "Category",
    "name_plural": "Categories",
    "description": "Post categories",
    "hierarchical": true,
    "show_in_menu": true
  }
]
```

---

### Create Taxonomy

Register a new taxonomy for a post type.

**Endpoint:** `POST /api/v1/:postType/taxonomies`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "slug": "tags",
  "name_singular": "Tag",
  "name_plural": "Tags",
  "description": "Post tags",
  "hierarchical": false,
  "show_in_menu": true
}
```

**Response:** `201 Created`

**Required Capabilities:** `manage_taxonomies`

---

### Update Taxonomy

Update an existing taxonomy.

**Endpoint:** `PATCH /api/v1/:postType/taxonomies/:slug`

**Response:** `200 OK`

---

### Delete Taxonomy

Delete a taxonomy.

**Endpoint:** `DELETE /api/v1/:postType/taxonomies/:slug`

**Response:** `200 OK`

**Required Capabilities:** `manage_taxonomies`

---

## Terms Endpoints

### List Terms

Get all terms for a taxonomy.

**Endpoint:** `GET /api/v1/:postType/terms/:taxonomy`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "taxonomy_slug": "categories",
      "slug": "news",
      "name": "News",
      "description": "News articles",
      "parent_id": null,
      "created_at": "2025-11-11T10:00:00.000Z"
    }
  ],
  "total": 10
}
```

---

### Create Term

Add a new term to a taxonomy.

**Endpoint:** `POST /api/v1/:postType/terms/:taxonomy`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "name": "Technology",
  "slug": "technology",
  "description": "Tech-related posts",
  "parent_id": null
}
```

**Response:** `201 Created`

**Required Capabilities:** `manage_terms`

---

### Update Term

Update an existing term.

**Endpoint:** `PATCH /api/v1/:postType/terms/:taxonomy/:idOrSlug`

**Response:** `200 OK`

---

### Delete Term

Delete a term.

**Endpoint:** `DELETE /api/v1/:postType/terms/:taxonomy/:idOrSlug`

**Response:** `200 OK`

**Required Capabilities:** `manage_terms`

---

## Users Endpoints

### List Users

Get all users.

**Endpoint:** `GET /api/v1/users`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `limit` - Number of items per page (default: 10)
- `offset` - Number of items to skip (default: 0)
- `search` - Search by email or display name

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": 1,
      "email": "user@example.com",
      "display_name": "John Doe",
      "created_at": "2025-11-11T10:00:00.000Z",
      "roles": ["admin"]
    }
  ],
  "total": 50
}
```

**Required Capabilities:** `list_users`

---

### Get User

Get a specific user by ID.

**Endpoint:** `GET /api/v1/users/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "display_name": "John Doe",
  "created_at": "2025-11-11T10:00:00.000Z",
  "updated_at": "2025-11-11T10:00:00.000Z",
  "meta": {
    "bio": "Software developer"
  },
  "roles": ["admin"],
  "capabilities": ["manage_posts", "manage_users"]
}
```

**Required Capabilities:** `read_user` or own user

---

### Create User

Create a new user.

**Endpoint:** `POST /api/v1/users`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123",
  "display_name": "Jane Smith",
  "roles": ["editor"]
}
```

**Response:** `201 Created`

**Required Capabilities:** `create_users`

---

### Update User

Update an existing user.

**Endpoint:** `PATCH /api/v1/users/:id`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:** (all fields optional)
```json
{
  "display_name": "Updated Name",
  "meta": {
    "bio": "Updated bio"
  },
  "roles": ["admin"]
}
```

**Response:** `200 OK`

**Required Capabilities:** `edit_users` or own user

---

### Delete User

Delete a user.

**Endpoint:** `DELETE /api/v1/users/:id`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

**Required Capabilities:** `delete_users`

---

## Plugins Endpoints

### List Plugins

Get all installed plugins.

**Endpoint:** `GET /api/v1/plugins`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
[
  {
    "slug": "my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "description": "Plugin description",
    "author": "Author Name",
    "active": true,
    "path": "/hd-content/plugins/my-plugin"
  }
]
```

**Required Capabilities:** `manage_plugins`

---

### Get Plugin

Get details for a specific plugin.

**Endpoint:** `GET /api/v1/plugins/:slug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

---

### Upload Plugin

Upload a plugin ZIP file.

**Endpoint:** `POST /api/v1/plugins/upload`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: multipart/form-data`

**Request Body:** (multipart form data)
- `file` - Plugin ZIP file

**Response:** `201 Created`
```json
{
  "slug": "new-plugin",
  "message": "Plugin uploaded successfully"
}
```

**Required Capabilities:** `install_plugins`

---

### Activate Plugin

Activate an installed plugin.

**Endpoint:** `POST /api/v1/plugins/:slug/activate`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "message": "Plugin activated successfully"
}
```

**Required Capabilities:** `activate_plugins`

---

### Deactivate Plugin

Deactivate an active plugin.

**Endpoint:** `POST /api/v1/plugins/:slug/deactivate`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "message": "Plugin deactivated successfully"
}
```

**Required Capabilities:** `activate_plugins`

---

### Delete Plugin

Delete an installed plugin.

**Endpoint:** `DELETE /api/v1/plugins/:slug`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "message": "Plugin deleted successfully"
}
```

**Required Capabilities:** `delete_plugins`

---

### Search NPM for Plugins

Search the NPM registry for plugins.

**Endpoint:** `GET /api/v1/plugins/search/npm`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**
- `q` - Search query

**Response:** `200 OK`
```json
[
  {
    "name": "@htmldrop/example-plugin",
    "version": "1.0.0",
    "description": "Example plugin",
    "keywords": ["hd-plugin"]
  }
]
```

**Required Capabilities:** `install_plugins`

---

### Install Plugin from NPM

Install a plugin from NPM registry.

**Endpoint:** `POST /api/v1/plugins/install/npm`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "package": "@htmldrop/example-plugin",
  "version": "1.0.0"
}
```

**Response:** `201 Created`

**Required Capabilities:** `install_plugins`

---

### Get Plugin Versions

Get available versions for an NPM plugin.

**Endpoint:** `GET /api/v1/plugins/:slug/versions`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "versions": ["1.0.0", "1.1.0", "2.0.0"],
  "current": "1.0.0"
}
```

---

### Change Plugin Version

Upgrade or downgrade a plugin version.

**Endpoint:** `POST /api/v1/plugins/:slug/change-version`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "version": "2.0.0"
}
```

**Response:** `200 OK`

**Required Capabilities:** `update_plugins`

---

## Themes Endpoints

Theme endpoints work similarly to plugin endpoints.

### List Themes

**Endpoint:** `GET /api/v1/themes`

### Get Theme

**Endpoint:** `GET /api/v1/themes/:slug`

### Upload Theme

**Endpoint:** `POST /api/v1/themes/upload`

### Activate Theme

**Endpoint:** `POST /api/v1/themes/:slug/activate`

### Deactivate Theme

**Endpoint:** `POST /api/v1/themes/deactivate`

### Delete Theme

**Endpoint:** `DELETE /api/v1/themes/:slug`

### Search NPM for Themes

**Endpoint:** `GET /api/v1/themes/search/npm`

### Install Theme from NPM

**Endpoint:** `POST /api/v1/themes/install/npm`

### Get Theme Versions

**Endpoint:** `GET /api/v1/themes/:slug/versions`

### Change Theme Version

**Endpoint:** `POST /api/v1/themes/:slug/change-version`

**Required Capabilities:** `manage_themes`, `install_themes`, `delete_themes`

---

## Options Endpoints

### List Options

Get all options.

**Endpoint:** `GET /api/v1/options`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "site_title": "My Site",
  "site_description": "A great site",
  "active_plugins": ["plugin-1", "plugin-2"],
  "theme": "default-theme"
}
```

**Required Capabilities:** `manage_options`

---

### Get Option

Get a specific option value.

**Endpoint:** `GET /api/v1/options/:name`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "name": "site_title",
  "value": "My Site"
}
```

---

### Set Option

Set or update an option value.

**Endpoint:** `PUT /api/v1/options/:name`

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "value": "New Site Title",
  "autoload": true
}
```

**Response:** `200 OK`

**Required Capabilities:** `manage_options`

---

### Delete Option

Delete an option.

**Endpoint:** `DELETE /api/v1/options/:name`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

**Required Capabilities:** `manage_options`

---

## Dashboard Endpoints

### Get Dashboard Data

Get dashboard statistics and overview.

**Endpoint:** `GET /api/v1/dashboard`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`
```json
{
  "posts": {
    "total": 100,
    "published": 80,
    "drafts": 20
  },
  "pages": {
    "total": 20,
    "published": 18,
    "drafts": 2
  },
  "users": {
    "total": 50
  },
  "recent_posts": []
}
```

---

## Translations Endpoints

### Get Translations

Get translation strings for a locale.

**Endpoint:** `GET /api/v1/translations`

**Query Parameters:**
- `locale` - Language code (e.g., `en`, `nb`, `es`)

**Response:** `200 OK`
```json
{
  "hello": "Hello",
  "welcome": "Welcome to HTMLDrop CMS"
}
```

---

## Setup Endpoints

### Setup Database

Initialize database and run migrations.

**Endpoint:** `POST /api/v1/setup/database`

**Request Body:**
```json
{
  "db_type": "sqlite",
  "db_path": "./hd-content/config/database.sqlite"
}
```

**Response:** `200 OK`

---

### Setup Admin User

Create the initial admin user.

**Endpoint:** `POST /api/v1/setup/admin`

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securePassword123",
  "display_name": "Admin User"
}
```

**Response:** `201 Created`

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - No permission
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (duplicate)
- `500 Internal Server Error` - Server error

---

## Rate Limiting

API endpoints are rate-limited to prevent abuse:
- **Default limit:** 100 requests per 15 minutes per IP
- **Auth endpoints:** 5 requests per 15 minutes per IP

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1636621200
```

---

## Pagination

List endpoints support pagination using `limit` and `offset` parameters:

```bash
# Get items 20-30
GET /api/v1/posts?limit=10&offset=20
```

Response includes pagination metadata:
```json
{
  "items": [],
  "total": 100,
  "limit": 10,
  "offset": 20
}
```

---

## Versioning

The API uses URL versioning. The current version is `v1`.

Future versions will be accessible via:
- `/api/v2/...`
- `/api/v3/...`

---

## Need Help?

- **Documentation:** [/docs](/docs)
- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Community:** [GitHub Discussions](https://github.com/your-repo/discussions)
