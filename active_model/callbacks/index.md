# Callbacks

`ActiveModel::Callbacks` lets you register hooks that run around your CRUD methods. Include the mix-in, then register callbacks and wrap your own logic in the matching `run_*_callbacks` helper.

```
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
      # persist to the database here
      puts "saving #{attributes}"
      true
    end
  end
end
```

## Available callbacks

Four lifecycle operations, each with a before and after hook:

| Operation | Hooks                             | Runner                  |
| --------- | --------------------------------- | ----------------------- |
| create    | `before_create`, `after_create`   | `run_create_callbacks`  |
| save      | `before_save`, `after_save`       | `run_save_callbacks`    |
| update    | `before_update`, `after_update`   | `run_update_callbacks`  |
| destroy   | `before_destroy`, `after_destroy` | `run_destroy_callbacks` |

## How they run

A `run_<op>_callbacks` call invokes the registered `before_*` hooks, yields to your block, then invokes the `after_*` hooks, and returns the block's result.

```
def run_save_callbacks(&block)
  before_save
  result = yield
  after_save
  result
end
```

Note

You must define the method you want to guard (`save`, `create`, …) yourself and wrap its body in the matching runner — ActiveModel does not define these CRUD methods for you. The runners nest cleanly, so an `update` that also saves can wrap `run_update_callbacks { run_save_callbacks { ... } }`.

Register with a method name, several names, or a block. Callbacks fire in declaration order. A subclass runs its own callbacks first, then its ancestors'. A block callback's body is inlined into the model, so `self` is the instance.

```
before_create :assign_id, :stamp_created_at
after_save { puts "saved #{name}" }
```

## See also

- [Active Model](https://spider-gazelle.net/active_model/index.md)
- [Validations](https://spider-gazelle.net/active_model/validations/index.md)
- [PgORM](https://spider-gazelle.net/pg_orm/index.md)
