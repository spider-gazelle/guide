Associations wire models together with `belongs_to`, `has_one` and `has_many`. Each macro generates accessor methods and hooks the relationship into the save/destroy lifecycle.

```crystal
class Parent < PgORM::Base
  attribute name : String
  has_many :children, class_name: Child
end

class Child < PgORM::Base
  attribute age : Int32
  belongs_to :parent
end
```

!!! note
    A `has_many` needs the matching `belongs_to` on the child — that is where the foreign key lives.

All three macros infer their class and foreign key from the name and accept the same overrides: `class_name`, `foreign_key`, `autosave` and `dependent`.

## belongs_to

The child owns the foreign key. `belongs_to :parent` generates, on `Child`:

- `parent` / `parent?` — returns the associated record (`?` returns nil instead of raising);
- `parent=(record)` — assigns it and sets `parent_id`;
- `build_parent(**attrs)` — builds an unsaved associated record;
- `create_parent(**attrs)` / `create_parent!(**attrs)` — builds and saves it (`!` raises `PgORM::Error::RecordNotSaved` on failure);
- `reload_parent` — force a reload from the database.

```crystal
child = Child.new(age: 6)
child.build_parent(name: "Phil")   # unsaved
child.parent = existing_parent     # sets child.parent_id
child.save
```

The foreign key defaults to `<name>_id` and the class to the camelcased name; override with `foreign_key:` / `class_name:`.

## has_one

Declares a one-to-one where the *other* table holds the foreign key. `has_one :supplier` on `Account` generates `supplier`, `supplier=`, `build_supplier`, `create_supplier`, `create_supplier!` and `reload_supplier`. Assigning through `supplier=` sets the foreign key on the new record and saves it, applying the `dependent` behaviour to the record it replaces.

```crystal
account.create_supplier!(name: "ACME")
account.supplier   # => #<Supplier account_id: 1>
```

## has_many

Declares a one-to-many. `has_many :children` on `Parent` generates a single method, `children`, returning a lazy `PgORM::Relation`. The relation is a full query scope — chain any query method onto it — and it can build and create children pre-wired to the parent:

```crystal
parent = Parent.create!(name: "Phil")

parent.children.create(age: 6)      # INSERT with parent_id set
parent.children.build(age: 3)       # unsaved, parent_id set
parent.children.where_gt(:age, 5).to_a
parent.children.to_a.size
```

Pass `serialize: true` to include the loaded children in the parent's `to_json` output.

## Generated method summary

| Macro | Reader | Builders | Reload |
| --- | --- | --- | --- |
| `belongs_to` | `name` / `name?` | `build_name`, `create_name`, `create_name!` | `reload_name` |
| `has_one` | `name` / `name?` | `build_name`, `create_name`, `create_name!` | `reload_name` |
| `has_many` | `name` → `Relation` | `name.build`, `name.create` | — |

## Dependency handling

`dependent:` decides what happens to associated records when the owner is destroyed. It is honoured by `destroy` (which wraps the work in a transaction), not by the callback-free `delete`.

| Option | Effect |
| --- | --- |
| `nil` | do nothing (default for `belongs_to`) |
| `:nullify` | set the foreign key to `NULL` in SQL (default for `has_one` / `has_many`) |
| `:delete` | delete the associated rows in SQL, no callbacks |
| `:destroy` | call `#destroy` on each associated record, running its callbacks |

```crystal
class Parent < PgORM::Base
  has_many :children, dependent: :destroy
end

class Child < PgORM::Base
  belongs_to :parent
  has_many :pets, dependent: :delete
end
```

## Autosave

`autosave:` controls whether associated records are saved together with the owner:

- `nil` (default) — save only newly *built* associations when the owner is saved;
- `true` — always save the association, new or persisted;
- `false` — never save it automatically.

## Lazy loading and joins

Associations lazy-load: the associated record or relation is not fetched until you access it. When you drive the query through a `join`, PgORM caches the joined rows so that accessing the linked association uses the cache instead of a second query.

```crystal
Parent.where(id: parent.id).join(:left, Child, :parent_id).to_a.first
```

See [Querying](querying.md) for joins in full.
