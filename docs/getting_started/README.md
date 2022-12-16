Spider-Gazelle does not have any other dependencies outside of [Crystal](https://crystal-lang.org) and [Shards](https://crystal-lang.org/reference/the_shards_command/index.html).
It is designed in such a way to be non-intrusive, and not require a strict organizational convention in regards to how a project is setup;
this allows it to use a minimal amount of setup boilerplate while not preventing it for more complex projects.

## Installation

Add the dependency to your `shard.yml`:

```yaml
dependencies:
  action-controller:
    github: spider-gazelle/action-controller
    version: ~> 5.1
```

Run `shards install`.

## Usage

Spider-Gazelle has a goal of being easy to start using for simple use cases, while still allowing flexibility/customizability for larger more complex use cases.

### Routing

Spider-Gazelle is a MVC based framework, as such, the logic to handle a given route is defined in an [ActionController::Base][] class.

```crystal
require "action-controller"

# Define a controller
class ExampleController < AC::Base
  # defaults to "/example_controller" overwrite with this directive
  base "/"

  # Define an action to handle the related route
  @[AC::Route::GET("/")]
  def index
    "Hello World"
  end

  # The macro DSL can also be used
  get "/dsl" do
    render text: "Hello World"
  end
end

# Run the server
require "action-controller/server"
AC::Server.new.run

# GET / # => Hello World
```

Routing is handled via [LuckyRouter](https://github.com/luckyframework/lucky_router) for insanely fast route matching.
See the routing [documentation](./routing.md) for more information.

Controllers are simply classes and routes are simply methods. Controllers and actions can be documented/tested as you would any Crystal class/method.

### Route and Query Parameters

Arguments are converted to their expected types if possible, otherwise an error response is automatically returned.
The values are provided directly as method arguments, thus preventing the need for `params["name"]` and any boilerplate related to it.
Just like normal method arguments, default values can be defined.
The method's return type adds some type safety to ensure the expected value is being returned, however it is optional.

```crystal
require "action-controller"

# base route is inferred off the class
class Add < AC::Base
  @[AC::Route::GET("/:value1/:value2")]
  def add(value1 : Int32, value2 : Int32, negative : Bool = false)
    sum = value1 + value2
    negative ? -sum : sum
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /add/2/3               # => 5
# GET /add/5/5?negative=true # => -10
# GET /add/foo/12            # => AC::Route::Param::ValueError<@message="invalid parameter value" @parameter="value1" @restriction="Int32">
```

Route and query params are automatically inferred based on the route annotation and map directly to the method's arguments. See the related annotation docs for more information.

```crystal
require "action-controller"

class ExampleController < AC::Base
  base "/"

  @[AC::Route::GET("/", config: {page: {base: 16}})]
  def index(page : Int32)
    page
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /          # => AC::Route::Param::MissingError<@message="missing required parameter" @parameter="value1" @restriction="Int32">
# GET /?page=10  # => 16 (as we configured the page param to accept hex values)
# GET /?page=bar # => AC::Route::Param::ValueError<@message="invalid parameter value" @parameter="value1" @restriction="Int32">
```

Params can be customised at the argument level too using the `@[AC::Param::Converter]` annotation

```crystal
require "action-controller"

class ExampleController < AC::Base
  base "/"

  @[AC::Route::GET("/")]
  def index(
    @[AC::Param::Converter(class: OptionalConvertorKlass, config: {base: 16}, name: "customParamName")]
    page : Int32
  )
    page
  end
end

require "action-controller/server"
AC::Server.new.run
```

#### Body parsing

The request body can be accessed via the helper method `request`, `request.body`
However it is recommended that the body be deserializing directly into an object

```crystal
require "json"
require "yaml"
require "action-controller"

struct UserName
  include JSON::Serializable
  include YAML::Serializable

  getter id : Int32
  getter name : String
end

class ExampleController < AC::Base
  base "/"

  @[AC::Route::POST("/data", body: :user)]
  def data(user : UserName) : String
    user.name
  end
end

require "action-controller/server"
AC::Server.new.run

# POST /data body: {"id":1,"name":"Jim"} # => Jim
# curl -d '{"id":1,"name":"Jim"}' --header "Content-Type: application/json" http://localhost:3000/data => Jim
```

Spider-Gazelle configures a JSON parser by default, however you can add custom parsers, configure a new default and also remove the JSON parser

```crystal
  abstract class AppBase < AC::Base
    add_parser("application/yaml") { |klass, body_io| klass.from_yaml(body_io.gets_to_end) }
  end
```

You then use the [Content-Type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type) header to specify the format of your request body

### Responding

Responses are automatically rendered via a responder and selected using the requests [Accept](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept) header
You can also use the `response` object to fully customize the response; such as adding some one-off headers.

```crystal
require "action-controller"
require "yaml"

abstract class MyApplication < AC::Base
  # the responder block is run in the context of the current controller instance
  # if you need access to the `request` or `response` or any other helpers to render the response
  add_responder("application/yaml") { |io, result, _klass_symbol, _method_symbol| result.to_yaml(io) }
  default_responder "application/yaml"
end

# Define a controller
class ExampleController < MyApplication
  # defaults to "/example_controller" overwrite with this directive
  base "/"

  # Define an action to handle the related route
  @[AC::Route::GET("/")]
  def index
    "Hello World"
  end
end

require "action-controller/server"
AC::Server.new.run

# GET / # => "--- Hello World"
```

### Error Handling

Unhandled exceptions are represented as a `500 Internal Server Error`
Error handlers can be defined gloabally, in your abstract base class, or specificially to a controller.

```crystal
require "action-controller"

class Divide < AC::Base
  @[AC::Route::GET("/:num1/:num2")]
  def divide(num1 : Int32, num2 : Int32) : Int32
    num1 // num2
  end

  @[AC::Route::Exception(DivisionByZeroError, status_code: HTTP::Status::BAD_REQUEST)]
  def division_by_zero(error)
    {
      error: error.message
    }
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /divide/10/0  # => {"error": "Division by 0"}
# GET /divide_rescued/10/10 # => 1
```

### CORS management

CORS policy can be defined in a `before_action`

```crystal
require "action-controller"

abstract class Application < AC::Base
  before_action :enable_cors

  def enable_cors
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Content-Type"] = "application/json"
    response.headers["Access-Control-Allow-Methods"] = "GET,HEAD,POST,DELETE,OPTIONS,PUT,PATCH"
  end
end

# Define a controller
class ExampleController < Application
  base "/"

  @[AC::Route::OPTIONS("/")]
  def cors
  end

  @[AC::Route::GET("/")]
  def index
    render json: {"message" => "Hello World"}
  end
end

# Run the server
require "action-controller/server"
AC::Server.new.run

```

### Logging

Logging is handled via Crystal's [Log](https://crystal-lang.org/api/Log.html) module. Spider-Gazelle logs when a request matches a controller action, as well as any exception. This of course can be augmented with additional application specific messages.

Here we're adding context to the logger that is valid for the lifetime of the request.

```crystal
require "action-controller"
require "uuid"

abstract class MyApplication < AC::Base
  # NOTE:: you can chain this log from a base log instance
  Log = ::Log.for("myapplication.controller")

  @[AC::Route::Filter(:before_action)]
  def set_request_id
    request_id = UUID.random.to_s
    Log.context.set(
      client_ip: client_ip,
      request_id: request_id
    )
    response.headers["X-Request-ID"] = request_id
  end
end
```

A new log context is provided for every request. All logs made during the lifetime of the request will be tagged with anything added to it.

### WebSockets

websockets can be defined just like any other route, this is a very basic chat room app (probably should have some locks etc)

```crystal
require "action-controller"

class ExampleController < AC::Base
  base "/"

  SOCKETS = Hash(String, Array(HTTP::WebSocket)) { |hash, key| hash[key] = [] of HTTP::WebSocket }

  @[AC::Route::WebSocket("/websocket/:room")]
  def websocket(socket, room : String)
    puts "Socket opened"
    sockets = SOCKETS[room]
    sockets << socket

    socket.on_message do |message|
      sockets.each &.send("#{message} + #{@me}")
    end

    socket.on_close do
      puts "Socket closed"
      sockets.size == 1 ? SOCKETS.delete(room) : sockets.delete(socket)
    end
  end
end
```

### Filtering

Filters are methods that are run "around", "before" or "after" a controller action.

Filters are inherited, so if you set a filter on a base Controller, it will be run on every controller in your application.

* `around_action` wraps all the before filters and the request, useful for setup database transactions
* `before_action` runs before the action method, useful for checking authentication, authorisation and loading resources required by the action (keep your code DRY)
* `after_action` run after the response data has been sent to the client, has access to the response

#### Before filters

After filters can be used in the same way as before filters

```crystal
abstract class MyApplication < AC::Base
  base "/"

  getter! user : User
  getter! comment : Comment

  @[AC::Route::Filter(:before_action, except: :login)]
  def get_current_user
    user_id = session["user_id"]?
    render :unauthorized unless user_id
    @user = User.find!(user_id)
  end

  @[AC::Route::Filter(:before_action, only: [:update_comment, :delete_comment])]
  def check_access(id : Int64?)
    if id
      @comment = Comment.find!(id)
      render :forbidden unless comment.user_id == user.id
    end
  end
end
```

#### Around filters

Around filters must yield to the action.

```crystal
abstract class MyApplication < AC::Base
  base "/"

  @[AC::Route::Filter(:around_action, only: [:create, :update, :destroy])]
  def wrap_in_transaction
    Database.transaction { yield }
  end
end
```

#### Skipping filters

If you have a filter on a base class like `get_current_user` above, you might want to skip this in another controller.

```crystal
abstract class MyApplication < AC::Base
  getter! user : User

  @[AC::Route::Filter(:before_action, except: :login)]
  def get_current_user
    user_id = session["user_id"]?
    render :unauthorized unless user_id
    @user = User.find!(user_id)
  end
end

class PublicController < MyApplication
  base "/public"

  skip_action :get_current_user, only: :index

  @[AC::Route::GET("/")]
  def index
    "Hello World"
  end
end
```

## Force HTTPS protocol

Sometime you might want to force a particular controller to only be accessible via an HTTPS protocol for security reasons. You can use the `force_ssl` method in your controller to enforce that:

```crystal
class DinnerController < Application
  force_ssl
end

```

## The request and response objects

In every controller there are two accessor methods pointing to the request and the response objects associated with the request cycle that is currently in execution.
The `request` method contains an instance of [`HTTP::Request`](https://crystal-lang.org/api/latest/HTTP/Request.html) and the `response` method returns an instance of [`HTTP::Server::Response`](https://crystal-lang.org/api/latest/HTTP/Server/Response.html) representing what is going to be sent back to the client.

### Setting custom headers

If you want to set custom headers for a response then `response.headers` is the place to do it.
The headers attribute is a hash which maps header names to their values, and Spider-Gazelle will set some of them automatically.
If you want to add or change a header, just assign it to `response.headers` this way:

```crystal
response.headers["Content-Type"] = "application/pdf"

```

> in the above case it would make more sense to use the `response.content_type` setter directly.
