PgORM ships an ActiveRecord-style query DSL. Every method returns a new scope, so you compose queries by chaining and only touch the database when you load results (`to_a`, `first`, `each`, `count`, …).

```crystal
User.where(active: true)
    .where_gte(:age, 18)
    .order(created_at: :desc)
    .limit(20)
    .to_a
```

## where and variants

`where` takes keyword arguments, a hash, or raw SQL with `?` placeholders. `nil` becomes `IS NULL`, an array becomes `IN (...)`.

```crystal
User.where(name: "John", group_id: 2)
User.where(group_id: nil)             # IS NULL
User.where(group_id: [1, 2, 3])       # IN (1, 2, 3)
User.where("LENGTH(name) > ?", 10)    # raw fragment
User.where_not(role: "guest")
```

### Pattern matching

```crystal
User.where_like(:email, "%@example.com")     # LIKE (case-sensitive)
User.where_ilike(:domain, "%example%")       # ILIKE (case-insensitive)
User.where_not_like(:email, "%@spam.com")
User.where_not_ilike(:name, "%test%")
```

### Comparison and range

```crystal
User.where_gt(:age, 18)     # >
User.where_gte(:age, 18)    # >=
User.where_lt(:age, 65)     # <
User.where_lte(:age, 65)    # <=

User.where_between(:age, 18, 65)          # BETWEEN (inclusive)
User.where_not_between(:age, 18, 65)      # NOT BETWEEN
```

### OR composition

`or` combines two scopes; each side is parenthesised and joined with `OR`.

```crystal
User.where(name: "John").or(User.where(name: "Jane"))
# => WHERE (name = 'John') OR (name = 'Jane')

User.where(active: true, role: "admin")
    .or(User.where(active: true, role: "moderator"))
```

## Ordering

```crystal
User.order(:name)                      # ORDER BY name ASC
User.order(name: :asc, group_id: :desc)
User.order("name ASC, group_id DESC")  # raw
User.reorder(:created_at)              # replaces any prior order
```

## Joins

`join` takes the join type, the model to join, and the foreign key (or an `on` string). Supported types are `:inner`, `:left`, `:right` and `:full`.

```crystal
Author.join(:left, Book, :author_id)
      .where("books.published = ?", true)
      .to_a
```

When you load through a join, the linked association rows are cached, so accessing that association afterwards does not issue a second query.

## Aggregates and bulk operations

```crystal
User.count
User.where(active: true).count
User.sum(:age)
User.average(:age)
User.minimum(:age)
User.maximum(:age)
User.pluck(:name)                      # Array of a single column
User.ids                               # primary key values

User.where(group_id: 1).update_all(active: false)
User.where(active: false).delete_all
User.where(group_id: 1).exists?
```

## Pagination

Three strategies, all lazy — metadata is computed up front and records load only when accessed. Chain `paginate*` onto any scope.

### Page-based

```crystal
result = Article.where(published: true).paginate(page: 2, limit: 20)

result.total        # => 150
result.page         # => 2
result.total_pages  # => 8
result.has_next?    # => true
result.next_page    # => 3
result.from         # => 21
result.to           # => 40

result.records      # loads the page
result.each { |a| process(a) }
```

### Offset-based

```crystal
result = Article.paginate_by_offset(offset: 40, limit: 20)
result.offset  # => 40
result.page    # => 3 (offset / limit + 1)
```

### Cursor-based

Efficient for large datasets. Order by the cursor column, then walk forward with `after` or back with `before`.

```crystal
page = Article.order(:id).paginate_cursor(limit: 20)
page.records
page.has_next?     # => true
page.next_cursor   # => "123"

Article.order(:id).paginate_cursor(after: page.next_cursor, limit: 20)
Article.order(:created_at).paginate_cursor(after: cursor, cursor_column: :created_at)
```

`limit` defaults to `25` for page and offset pagination. Over a join, counting uses `COUNT(DISTINCT ...)` so duplicated join rows don't inflate `total`.

### JSON

Both result types serialise their records under `data` with a `pagination` block:

```crystal
Article.where(published: true).paginate(page: 2, limit: 10).to_json
# { "data": [...], "pagination": { "total": 150, "page": 2, "total_pages": 15,
#   "has_next": true, "has_prev": true, "next_page": 3, "from": 11, "to": 20, ... } }
```

## Full-text search

Search uses PostgreSQL `tsvector`/`tsquery`. Columns can be symbols, strings or an array; the query supports the boolean operators `&`, `|` and `!`.

```crystal
Article.search("crystal", :title, :content)
Article.search("crystal & programming", :title, :content)   # AND
Article.search("crystal | ruby", :title, :content)          # OR
Article.search("running", :content, config: "simple")       # no stemming
```

### Ranked and weighted

```crystal
# order by relevance (ts_rank / ts_rank_cd)
Article.search_ranked("crystal programming", :title, :content)

# per-column weights (A=1.0, B=0.4, C=0.2, D=0.1)
weights = {
  :title   => PgORM::FullTextSearch::Weight::A,
  :content => PgORM::FullTextSearch::Weight::B,
}
Article.search_weighted("crystal", weights)
Article.search_ranked_weighted("crystal", weights)
```

### Other search modes

```crystal
Article.search_phrase("crystal programming language", :content)  # exact phrase
Article.search_proximity("crystal", "programming", 5, :content)  # within N words
Article.search_prefix("cryst", :title, :content)                 # crystal, crystalline…
Article.search_plain("crystal programming", :title, :content)    # plainto_tsquery
```

### Pre-computed tsvector columns

For production, add a `tsvector` column with a GIN index and search it directly:

```crystal
Article.search_vector("crystal & programming", :search_vector)
Article.search_vector_ranked("crystal", :search_vector)
Article.search_vector_plain("crystal programming", :search_vector)
```

### Combining

Search chains with everything else — filters, ordering, pagination:

```crystal
Article.where(published: true)
       .search("crystal", :title, :content)
       .paginate(page: 1, limit: 20)
```

!!! note
    Use `.to_sql` to inspect the generated query, or `.explain` on a search scope to see PostgreSQL's execution plan.
