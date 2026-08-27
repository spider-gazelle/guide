`ActiveModel::Callbacks` lets you register hooks that run around your CRUD methods. Include the mix-in, then register callbacks and wrap your own logic in the matching `run_*_callbacks` helper.

```crystal
require "active-model"

class Person < ActiveModel::Model
  include ActiveModel::Callbacks

  attribute name : String
  attribute age : Int32

  before_save :capitalize

  def capitalize
    @name = @name.to_s.capitalize
  end

  def save
    run_save_callbacks do
      # persist to the database
      @backend.save(attributes)
    end
  end
end
```

## Available callbacks

Four lifecycle operations, each with a before and after hook:

| Operation | Hooks | Runner |
|-----------|-------|--------|
| create | `before_create`, `after_create` | `run_create_callbacks` |
| save | `before_save`, `after_save` | `run_save_callbacks` |
| update | `before_update`, `after_update` | `run_update_callbacks` |
| destroy | `before_destroy`, `after_destroy` | `run_destroy_callbacks` |

## How they run

A `run_<op>_callbacks` call invokes the registered `before_*` hooks, yields to your block, then invokes the `after_*` hooks, and returns the block's result.

```crystal
def run_save_callbacks(&block)
  before_save
  result = yield
  after_save
  result
end
```

!!! note
    You must define the method you want to guard (`save`, `create`, …) yourself and wrap its body in the matching runner — ActiveModel does not define these CRUD methods for you. The runners nest cleanly, so an `update` that also saves can wrap `run_update_callbacks { run_save_callbacks { ... } }`.

Register with a method name, several names, or a block. Callbacks fire in declaration order, and a subclass runs its ancestors' callbacks as well as its own.

```crystal
before_create :assign_id, :stamp_created_at
after_save { logger.info { "saved #{id}" } }
```
