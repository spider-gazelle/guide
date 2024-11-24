Controllers describe and handle routes. There are three methods for defining routes

* Strong Paramaters (recommended)
* Macro DSL (fine control)

## Strong Paramaters

This is the recommended method for routing. It conflates routing with the type casting of paramaters to help ensure program correctness by leveraging the type system.
The paramater type casting also applies to filters and exception handlers, where the use of the current routes paramaters is desired.

### Verbs

The following verbs are provided

```crystal
class Comments < Application
  base "/comments"

  @[AC::Route::GET("/")]
  def index; end

  @[AC::Route::POST("/")]
  def create; end

  @[AC::Route::PUT("/:id")]
  def replace(id : Int64 | String); end

  @[AC::Route::PATCH("/:id")]
  def update(id : Int64); end

  @[AC::Route::DELETE("/:id")]
  def destroy(id : String); end

  # optional id param
  @[AC::Route::OPTIONS("/?:id")]
  def options(id : Int64 | String | Nil); end
end

```

### Defining routes

Route paramaters, as opposed to query paramaters, are defined as part of the URL path.

* you may mark parts of the path with a `:` to have a param with a matching name in the action
  * i.e. `/users/:some_user_id` will result in a param named `some_user_id`
  * `/projects/:project_id/tasks/:task_id` would have a `project_id` and `task_id` param generated
* route paramaters take precedence over any query paramaters with matching names
* optional paramaters are prefixed with a `?`
  * `/users/?:some_user_id/groups` allows the path segment `some_user_id` to be optional
* glob path allows multiple segments (i.e. captures a `/` value as part of the params)
  * `/path/*:path_to_file` would match `/path/my/file/location.cr`, setting `param["path_to_file"] # => "my/file/location.cr"`

multiple routes can also be applied to a single function

```crystal
@[AC::Route::GET("/users/:id/groups")]
@[AC::Route::GET("/users/groups")]
def groups(user_id : Int64?); end
```

however in the example above you could achieve the same thing with a single route `@[AC::Route::GET("/users/?:id/groups")]`

### Extracting paramaters

Paramter extraction occurs accross the route params, [query params](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Identifying_resources_on_the_Web#query) and [form data](https://developer.mozilla.org/en-US/docs/Learn/Forms/Sending_and_retrieving_form_data)

Take the following example:

```crystal
# This could be an DB ORM etc
class MyModel
  include JSON::Serializable
  include YAML::Serializable

  getter x : Float64
  getter y : Float64
end

@[AC::Route::PATCH("/:id", body: :model)]
def replace(id : Int64, model : MyModel, merge_arrays : Bool = false); end
```

* the `id` is extracted from the route (the function paramater names are matched)
* `merge_arrays` is extracted from the query params and set to false if not provided
* the `model` being patched is extracted from the body and serialised according to the `Content-Type` header and matching parser

#### Customising parsing

Parsers can be customised to parse types in various different ways

```crystal
@[AC::Route::GET("/:id", config: {
  time: {format: "%F %:z"},
  degrees: {strict: false},
  id: {base: 16, underscore: true, strict: false}
})]
def replace(id : Int64, degrees : Float64, time : Time); end
```

There are built in parsers for the following types

* [Number](https://crystal-lang.org/api/latest/Number.html#direct-known-subclasses) types
* [String](https://crystal-lang.org/api/latest/String.html)
* [Char](https://crystal-lang.org/api/latest/Char.html)
* [Bool](https://crystal-lang.org/api/latest/Bool.html)
* [Time](https://crystal-lang.org/api/latest/Time.html)
* [Enum](https://crystal-lang.org/api/latest/Enum.html)
* [UUID](https://crystal-lang.org/api/latest/UUID.html)

You can find the [custom options here](https://github.com/spider-gazelle/action-controller/blob/master/src/action-controller/router/route_params.cr)

#### Custom paramater parser

You can implement your own type parsers, they can be any class that implements `def convert(raw : String)`. Initiailizer arguments are the possible customisations.

```crystal
record Commit, branch : String, commit : String

struct ::ActionController::Route::Param::ConvertCommit
  # i.e. `"master#742887"`
  def convert(raw : String)
    branch, commit = raw.split('#')
    Commit.new(branch, commit)
  end
end

@[AC::Route::GET("/:commit")]
def replace(commit : Commit); end
```

any converter scoped to `ActionController::Route::Param` and class name starting with `Convert` will automatically be converted. If you would like to be more explicit:

```crystal
record Commit, branch : String, commit : String

struct ConvertCommit
  # i.e. `"master#742887"`
  def convert(raw : String)
    branch, commit = raw.split('#')
    Commit.new(branch, commit)
  end
end

@[AC::Route::GET("/:commit", converters: {
  commit: ConvertCommit
})]
def replace(commit : Commit); end
```

### Response codes

By default all responses will return 200 OK. The default can be changed and response codes can be mapped to return types

```crystal
# change the default response code
@[AC::Route::GET("/", status_code: HTTP::Status::ACCEPTED)]
def replace(commit : Commit)
end

# map response codes to return types
@[AC::Route::GET("/", status: {
  Int32 => HTTP::Status::OK,
  String => HTTP::Status::ACCEPTED,
  Float64 => HTTP::Status::CREATED
})]
def replace : Int32 | String | Float64
  case rand(3)
  when 1
    1
  when 2
    0.5
  else
    "wasn't 1 or 2"
  end
end
```

## Macro DSL

The macro DSL is the basis for all routing in spider-gazelle. This is as close to the metal as you can get.

```crystal
class MyPhotos < Application
  # ...

  # GET /my_photos/:id/features
  get "/:id/features", :features do
    # e.g. render a list of features detected on the photo
    features = []
    render json: features
  end

  # POST /my_photos/:id/feature
  post "/my_photos/:id/feature", :feature do
    # add a feature to the photo
    head :ok
  end
end

```

In the example above we have created a new route with the name `features` defined by the `:features` symbol.
This creates a function called `features` in the class `MyPhotos` class that can be used with filters.

## Customizing routes

You might want to define a route that isn't defined by the class name of the controller.
This is also required if you would like to define a root route.

```crystal
class Welcome < Application
  base "/"

  @[AC::Route::GET("/")]
  def index; end
end

```

Or to define a complex route

```crystal
class Features < Application
  base "/my_photos/:photo_id/features"

  # GET /my_photos/:photo_id/features/
  @[AC::Route::GET("/")]
  def index; end

  # GET /my_photos/:photo_id/features/:id
  @[AC::Route::GET("/:id")]
  def show; end

  # POST /my_photos/:photo_id/features/
  @[AC::Route::POST("/")]
  def create; end
end

```

## Redirecting to other routes

Routes are available as class level functions on the controllers.
Consider the `Features` class above.

```crystal
Features.show("photo_id", "feature_id")
# => "/my_photos/photo_id/features/feature_id" : String

```

This can be combined with the redirect helper

```crystal
redirect_to Features.show("photo_id", "feature_id")

```

## Files and other binary data

The recommendation is to manually manage the response so it can be properly piped.
Here are two seperate examples:

```crystal
# example of directly writing data, no streaming
@[AC::Route::GET("/qr_code.png")]
def png_qr(
  @[AC::Param::Info(description: "the data in the QR code")]
  content : String
) : Nil
  size = 256 # px
  response.headers["Content-Disposition"] = "inline"
  response.headers["Content-Type"] = "image/png"
  @__render_called__ = true

  png_bytes = QRCode.new(content).as_png(size: size)
  response.write png_bytes
end
```

example of streaming data from the filesystem:

```crystal
# example of streaming a file, ensuring low memory usage
@[AC::Route::GET("/openapi.yaml")]
def openapi
  response.headers["Content-Disposition"] = %(attachment; filename="openapi.yml")
  response.headers["Content-Type"] = "application/yaml"
  @__render_called__ = true

  File.open("/app/openapi.yml") do |file|
    IO.copy(file, response)
  end
end
```

## Inspecting routes

To get a complete list of the available routes in your application
execute the `./app --routes` command in your terminal.
