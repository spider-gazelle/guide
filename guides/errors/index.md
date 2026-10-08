# Errors

Exception handlers turn exceptions into responses. Raise an error anywhere in a route, filter or the code they call, and a handler declared on the controller, or inherited from a parent, decides the status code and body. This page covers declaring handlers, the errors Spider-Gazelle raises, and what happens to exceptions nobody handles.

```
require "action-controller"

class Divide < AC::Base
  base "/divide"

  # Divides one number by another
  @[AC::Route::GET("/:num1/:num2")]
  def divide(num1 : Int32, num2 : Int32) : Int32
    num1 // num2
  end

  # Responds 400 when dividing by zero
  @[AC::Route::Exception(DivisionByZeroError, status_code: HTTP::Status::BAD_REQUEST)]
  def division_by_zero(error) : NamedTuple(error: String?)
    {error: error.message}
  end
end

require "action-controller/server"
AC::Server.new.run

# GET /divide/10/2  # => 200 5
# GET /divide/10/0  # => 400 {"error":"Division by 0"}
```

The handler's status code and return type are added to the responses of every route it covers in the [OpenAPI](https://spider-gazelle.net/openapi/index.md) document.

## Exception handlers

Annotate a method with `@[AC::Route::Exception(ErrorClass)]`. It handles that class and its subclasses, raised from any route or filter in the controller and its subclasses.

- The first argument is the exception. It's typed as the class in the annotation.
- The return value is rendered like a route's: serialised by the negotiated [responder](https://spider-gazelle.net/guides/responses/#responders).
- If the client's `Accept` header can't be satisfied, the default responder is used, so errors always get a response.

| Option          | Purpose                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `status_code:`  | The response status, `200 OK` if omitted, so always set it.                                                                         |
| `content_type:` | Always respond with this content type, see [fixed content types](https://spider-gazelle.net/guides/responses/#fixed-content-types). |

One method can handle several exception classes, each with its own status:

```
abstract class Application < AC::Base
  @[AC::Route::Exception(AC::Error::NotFound, status_code: HTTP::Status::NOT_FOUND)]
  @[AC::Route::Exception(AC::Error::Conflict, status_code: HTTP::Status::CONFLICT)]
  def resource_error(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end
end
```

Handlers can take extra arguments, parsed like [route parameters](https://spider-gazelle.net/guides/parameters/index.md). Make them nilable, as the failing request may not include them:

```
@[AC::Route::Exception(AC::Error::NotFound, status_code: HTTP::Status::NOT_FOUND)]
def not_found(error, id : Int64?) : NamedTuple(error: String?, id: Int64?)
  {error: error.message, id: id}
end
```

Handlers can also call [`render`, `head` or `redirect_to`](https://spider-gazelle.net/guides/responses/#render-head-and-redirect_to) to take full control of the response.

### Generic exceptions

Exceptions can be generic, for example an error class parameterised by its status code. Handle one instance, or name the generic itself to handle every instance:

```
class ApiError(Code) < Exception
  def code : Int32
    Code
  end
end

abstract class Application < AC::Base
  # handles ApiError(404) only
  @[AC::Route::Exception(ApiError(404), status_code: HTTP::Status::NOT_FOUND)]
  def api_not_found(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end

  # handles every other ApiError, such as ApiError(400) and ApiError(409)
  @[AC::Route::Exception(ApiError, status_code: HTTP::Status::BAD_REQUEST)]
  def api_error(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end
end
```

The status code in the annotation is fixed. To respond with each error's own code, call `render status: error.code, json: ...` in the handler.

## `rescue_from`

The `rescue_from` macro is an alternative that doesn't use annotations. Pass a method name, or a block:

```
class Books < AC::Base
  base "/books"

  rescue_from KeyError, :missing_key

  rescue_from IndexError do |error|
    render :not_found, json: {error: error.message}
  end

  def missing_key(error)
    render :not_found, json: {error: error.message}
  end
end
```

A `rescue_from` handler must send its response with `render` or `head`: its return value isn't rendered, and it doesn't add a response to the OpenAPI document. Prefer the annotation.

## Built-in errors

Spider-Gazelle raises these while handling a request:

| Error                             | Raised when                                         | Suggested status |
| --------------------------------- | --------------------------------------------------- | ---------------- |
| `AC::Route::Param::MissingError`  | a required parameter or header is missing           | `422`            |
| `AC::Route::Param::ValueError`    | a parameter can't be converted to its type          | `400`            |
| `AC::Route::NotAcceptable`        | no responder matches the `Accept` header            | `406`            |
| `AC::Route::UnsupportedMediaType` | no parser matches the request body's `Content-Type` | `415`            |

Both parameter errors inherit from `AC::Route::Param::Error`, which has `parameter` (the name) and `restriction` (the expected type). Both media type errors inherit from `AC::Route::Error`, which has `accepts`, the list of supported types.

These are provided for your own code, with no built-in handlers:

| Error                     | Typical status |
| ------------------------- | -------------- |
| `AC::Error::Unauthorized` | `401`          |
| `AC::Error::Forbidden`    | `403`          |
| `AC::Error::NotFound`     | `404`          |
| `AC::Error::Conflict`     | `409`          |

```
raise AC::Error::NotFound.new("no article with id #{id}")
```

`AC::Error` also provides response structs to return from handlers. All of them serialise to JSON and YAML:

| Struct                         | Fields                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `AC::Error::CommonResponse`    | `error`, and `backtrace` unless created with `backtrace: false` |
| `AC::Error::ParameterResponse` | `error`, `parameter`, `restriction`                             |
| `AC::Error::ContentResponse`   | `error`, `accepts`                                              |

## Handling parameter errors

Spider-Gazelle doesn't turn the built-in errors into responses for you. Without a handler, a missing parameter is a `500 Internal Server Error`. Handle them in your base class:

```
abstract class Application < AC::Base
  # a parameter is missing or can't be parsed
  @[AC::Route::Exception(AC::Route::Param::MissingError, status_code: HTTP::Status::UNPROCESSABLE_ENTITY)]
  @[AC::Route::Exception(AC::Route::Param::ValueError, status_code: HTTP::Status::BAD_REQUEST)]
  def invalid_param(error) : AC::Error::ParameterResponse
    AC::Error::ParameterResponse.new(
      error: error.message.as(String),
      parameter: error.parameter,
      restriction: error.restriction
    )
  end
end

# GET /search/books?q=crystal&limit=many
# => 400 {"error":"invalid parameter value for 'limit'","parameter":"limit","restriction":"Int32"}
```

## Recommended handlers

The [application template](https://spider-gazelle.net/getting_started/index.md) starts with handlers for the built-in errors. A complete base class, adding malformed JSON bodies and the `AC::Error` classes, looks like this:

```
require "action-controller"

abstract class Application < AC::Base
  # no acceptable response format, or an unsupported request body format
  @[AC::Route::Exception(AC::Route::NotAcceptable, status_code: HTTP::Status::NOT_ACCEPTABLE)]
  @[AC::Route::Exception(AC::Route::UnsupportedMediaType, status_code: HTTP::Status::UNSUPPORTED_MEDIA_TYPE)]
  def bad_media_type(error) : AC::Error::ContentResponse
    AC::Error::ContentResponse.new(error: error.message.as(String), accepts: error.accepts)
  end

  # a parameter is missing or can't be parsed
  @[AC::Route::Exception(AC::Route::Param::MissingError, status_code: HTTP::Status::UNPROCESSABLE_ENTITY)]
  @[AC::Route::Exception(AC::Route::Param::ValueError, status_code: HTTP::Status::BAD_REQUEST)]
  def invalid_param(error) : AC::Error::ParameterResponse
    AC::Error::ParameterResponse.new(error: error.message.as(String), parameter: error.parameter, restriction: error.restriction)
  end

  # the request body isn't valid JSON, or doesn't match the expected type
  @[AC::Route::Exception(JSON::ParseException, status_code: HTTP::Status::BAD_REQUEST)]
  def invalid_json(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end

  @[AC::Route::Exception(AC::Error::Unauthorized, status_code: HTTP::Status::UNAUTHORIZED)]
  @[AC::Route::Exception(AC::Error::Forbidden, status_code: HTTP::Status::FORBIDDEN)]
  @[AC::Route::Exception(AC::Error::NotFound, status_code: HTTP::Status::NOT_FOUND)]
  @[AC::Route::Exception(AC::Error::Conflict, status_code: HTTP::Status::CONFLICT)]
  def app_error(error) : AC::Error::CommonResponse
    AC::Error::CommonResponse.new(error, backtrace: false)
  end
end
```

## Inheritance and order

Handlers are inherited, so declare common ones once in your base class. Two rules follow from how handlers are combined:

- **A parent's handler wins.** If a parent and a subclass both handle the same exception class, the parent's handler is used.
- **The first matching handler wins.** Handlers are checked in order, parent classes first. A parent handler for a broad class such as `Exception` catches everything, including errors a subclass has a more specific handler for.

So keep broad handlers out of your base class, or put them in the leaf controllers that need them. For a catch-all `500` response, rely on the [error handler](#unhandled-exceptions) instead.

If a response has already been sent when an exception is raised, for example from an after filter, the handler can't send another one, and the exception continues as if it was unhandled.

## Unhandled exceptions

An exception without a handler propagates out of the controller. Add `AC::ErrorHandler` to the server's handlers to turn it into a response. The [application template](https://spider-gazelle.net/getting_started/index.md) does this in `src/config.cr`:

```
# App.running_in_production? is defined in the template's src/constants.cr
ActionController::Server.before(
  ActionController::ErrorHandler.new(App.running_in_production?, ["X-Request-ID"]),
  ActionController::LogHandler.new(["password", "bearer_token"]),
)
```

| Mode                                   | Response                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| development, `ErrorHandler.new(false)` | `500` with an HTML page showing the exception and backtrace                |
| production, `ErrorHandler.new(true)`   | `500` with a `{}` body if the client accepts JSON, otherwise an empty body |

The second argument lists response headers to keep when the response is reset, such as a request ID set by a filter. Never run the development mode in production, as it exposes your source and backtraces.

## See also

- [Responses](https://spider-gazelle.net/guides/responses/index.md): status codes and responders
- [Parameters](https://spider-gazelle.net/guides/parameters/index.md): the source of parameter errors
- [Filters](https://spider-gazelle.net/guides/filters/index.md): raising errors to stop a request
- [Logging](https://spider-gazelle.net/guides/logging/index.md): how exceptions are logged
- [OpenAPI: error responses](https://spider-gazelle.net/openapi/descriptions/#error-responses)
