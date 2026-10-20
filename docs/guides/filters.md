# Filters

Filters are controller methods that run before, around or after your routes. Use them
for work shared by many routes: authentication, loading records, setting headers,
wrapping actions in database transactions, and auditing.

```crystal
require "action-controller"

abstract class Application < AC::Base
  getter! current_user : String

  # Runs before every route in every controller that inherits from Application
  @[AC::Route::Filter(:before_action)]
  def authenticate(
    @[AC::Param::Info(header: "Authorization", description: "a bearer token")]
    auth : String? = nil,
  )
    render :unauthorized, text: "sign in required" unless auth == "Bearer secret"
    @current_user = "alice"
  end
end

class Profile < Application
  base "/profile"

  @[AC::Route::GET("/")]
  def show : String
    "signed in as #{current_user}"
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /profile                                   # => 401 sign in required
# GET /profile  (Authorization: Bearer secret)   # => "signed in as alice"
```

## Filter types

| Filter | Runs | Typical uses |
|---|---|---|
| `:before_action` | before the action | authentication, authorisation, loading records, headers |
| `:around_action` | wraps the before filters and the action, and must `yield` | transactions, timing, context that needs cleaning up |
| `:after_action` | after the action has rendered | logging, auditing, metrics |

A request runs in this order:

1. around filters, outermost first, each `yield`ing to the next;
2. before filters;
3. the action;
4. after filters.

Within each type, filters inherited from parent classes run first, then the
controller's own, in the order they're defined.

## Declaring filters

Annotate a method with `@[AC::Route::Filter(type)]`:

```crystal
abstract class Application < AC::Base
  @[AC::Route::Filter(:before_action)]
  def set_request_headers
    response.headers["X-Frame-Options"] = "DENY"
  end
end
```

Or register an existing method with the `before_action`, `around_action` and
`after_action` macros:

```crystal
abstract class Application < AC::Base
  before_action :set_request_headers

  private def set_request_headers
    response.headers["X-Frame-Options"] = "DENY"
  end
end
```

The two styles behave the same. The annotation form is preferred because filter
methods can then take [typed parameters](#typed-parameters). Methods registered with
the macros can be private and can't take parameters.

## Choosing routes with `only` and `except`

By default a filter applies to every route in the controller and its subclasses.
Limit it by route method name, with a symbol or an array of symbols:

```crystal
class Comments < Application
  base "/comments"

  @[AC::Route::Filter(:before_action, only: [:update, :destroy])]
  def check_owner
    # ...
  end

  @[AC::Route::Filter(:after_action, except: :index)]
  def audit
    Log.info { "#{action_name} by #{current_user}" }
  end

  @[AC::Route::GET("/")]
  def index : Array(String)
    [] of String
  end

  @[AC::Route::PATCH("/:id")]
  def update(id : Int64) : String
    "updated #{id}"
  end

  @[AC::Route::DELETE("/:id")]
  def destroy(id : Int64)
    head :no_content
  end
end
```

The macros take the same options: `before_action :check_owner, only: [:update, :destroy]`.

## Stopping a request

A before filter stops the request by sending a response with
[`render`, `head` or `redirect_to`](responses.md#render-head-and-redirect_to), or by
raising an exception. The remaining before filters and the action don't run:

```crystal
@[AC::Route::Filter(:before_action)]
def require_admin
  head :forbidden unless current_user == "admin"
end
```

Raising works well with [exception handlers](errors.md), because the same error then
gets the same response wherever it's raised:

```crystal
@[AC::Route::Filter(:before_action)]
def require_admin
  raise AC::Error::Forbidden.new("admins only") unless current_user == "admin"
end
```

After filters still run when a before filter has rendered, so they can log rejected
requests. Check `render_called?` if you need to tell the difference.

## Typed parameters

Annotation filters can take arguments, parsed exactly like
[route parameters](parameters.md): from the path, query string, form data or headers,
with type conversion, defaults and `@[AC::Param::Info]`.

This makes filters a good place to load the record a route works on:

```crystal
struct Article
  include JSON::Serializable

  getter id : Int64
  getter title : String

  def initialize(@id, @title)
  end
end

class Articles < AC::Base
  base "/articles"

  getter! article : Article

  @[AC::Route::Filter(:before_action, only: [:show, :update])]
  def find_article(id : Int64)
    @article = Article.new(id, "Article #{id}")
  end

  @[AC::Route::GET("/:id")]
  def show : Article
    article
  end

  @[AC::Route::PATCH("/:id")]
  def update(title : String) : Article
    Article.new(article.id, title)
  end
end
```

- A missing or invalid filter parameter raises the usual
  [parameter errors](errors.md#handling-parameter-errors).
- Make a parameter nilable, e.g. `id : Int64?`, when the filter applies to routes that
  don't all have it.
- Filter parameters are added to the OpenAPI parameters of every route the filter
  applies to. See [parameters from filters](../openapi/descriptions.md#parameters-from-filters).

`getter!` creates an `article` method that raises if `@article` is `nil`, and an
`article?` method that returns `nil` instead.

## Around filters

An around filter must accept a block and `yield` to run the rest of the request:

```crystal
abstract class Application < AC::Base
  @[AC::Route::Filter(:around_action, only: [:create, :update, :destroy])]
  def wrap_in_transaction(&)
    Database.transaction { yield }
  end
end
```

Code after `yield` runs once the before filters and the action have finished. Use
`ensure` for cleanup that must happen even if the action raises:

```crystal
@[AC::Route::Filter(:around_action)]
def instrument(&)
  started = Time.instant
  yield
ensure
  Log.info { "#{action_name} took #{Time.instant - started}" } if started
end
```

!!! note "Keep around filters thin"
    Crystal inlines a method that `yield`s into every route it wraps, so a large around
    filter is duplicated once per route in your binary. Keep the body small and move
    the work into ordinary methods.

## After filters

After filters run once the action has produced its response. They can read
`response.status_code` and `action_name`, but the body has already been written, so
don't use them to change the response.

After filters don't run if the action raises an exception. Put cleanup that must
always happen in an around filter's `ensure`.

## Skipping inherited filters

`skip_action` turns off an inherited filter, for all of a controller's routes or for
some of them:

```crystal
class Sessions < Application
  base "/sessions"

  # the sign in page can't require a signed in user
  skip_action :authenticate, only: [:sign_in]

  @[AC::Route::GET("/new")]
  def sign_in : String
    "sign in here"
  end
end
```

It takes the filter's method name, and works for annotation and macro filters alike.
Without `only:` or `except:` the filter is skipped for every route in the controller.

## See also

- [Routing](routing.md)
- [Parameters](parameters.md)
- [Responses](responses.md): `render`, `head` and `redirect_to`
- [Errors](errors.md): handling exceptions raised by filters
- [Sessions](sessions.md): reading the signed in user from a session
- [Logging](logging.md): request IDs and log context
