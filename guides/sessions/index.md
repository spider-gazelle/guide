# Sessions and cookies

A session stores a small amount of data for each user between requests, such as the ID of the logged-in user. Spider-Gazelle keeps the session in an encrypted, signed cookie, so there's no server-side session store to run. This page also covers reading and writing ordinary cookies.

## Example

```
require "action-controller"

ActionController::Session.configure do |settings|
  settings.key = "_my_app_session_"
  settings.secret = "4f74c0b358d5bab4000dd3c75465dc2c" # use your own, at least 32 bytes
end

class Sessions < AC::Base
  base "/session"

  # Logs the user in
  @[AC::Route::POST("/")]
  def create(username : String, password : String) : Nil
    if username == "steve" && password == "secret"
      session["user_id"] = 42_i64
      session["username"] = username
    else
      head :unauthorized
    end
  end

  # Returns the logged-in user
  @[AC::Route::GET("/")]
  def show : NamedTuple(user_id: Int64?, username: String?)
    {
      user_id:  session["user_id"]?.as(Int64?),
      username: session["username"]?.as(String?),
    }
  end

  # Logs the user out
  @[AC::Route::DELETE("/")]
  def destroy : Nil
    session.clear
  end
end
```

After `POST /session?username=steve&password=secret`, the response sets the `_my_app_session_` cookie. The browser sends it back on later requests, and `GET /session` returns `{"user_id":42,"username":"steve"}`.

## Configuration

Configure sessions once at start-up. In the [application template](https://spider-gazelle.net/getting_started/configuration/#sessions) this is in `src/config.cr`, and the key and secret come from the `COOKIE_SESSION_KEY` and `COOKIE_SESSION_SECRET` environment variables.

```
ActionController::Session.configure do |settings|
  settings.key = "_my_app_session_"
  settings.secret = ENV["COOKIE_SESSION_SECRET"]
  settings.secure = true
end
```

| Setting     | Type      | Default        | Description                                                                                                  |
| ----------- | --------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `key`       | `String`  | none, required | The name of the session cookie.                                                                              |
| `secret`    | `String`  | none, required | The secret used to encrypt and sign the cookie.                                                              |
| `max_age`   | `Int32`   | about 20 years | Cookie lifetime in seconds, from the time the session was last written.                                      |
| `secure`    | `Bool`    | `false`        | Adds the `Secure` attribute, so browsers only send the cookie over HTTPS.                                    |
| `encrypted` | `Bool`    | `true`         | Encrypts and signs the data. `false` only signs it, so the client can read the contents but not change them. |
| `path`      | `String`  | `"/"`          | The cookie `Path`.                                                                                           |
| `domain`    | `String?` | `nil`          | The cookie `Domain`. `nil` limits the cookie to the host that set it.                                        |

Rules:

- `key` and `secret` must be set before a session is used. They have no defaults.
- When `encrypted` is `true`, the secret must be **at least 32 bytes**. It's used as an AES-256 key, and a shorter secret raises an `ArgumentError` when a session is written. `openssl rand -hex 16` prints a suitable 32 character secret.
- Changing the secret invalidates every existing session. Cookies that fail to decrypt or verify are ignored, so those users get an empty session.
- Set `secure` to `true` in production. The template does this when `SG_ENV` is `production`.

The session cookie is always `HttpOnly` (JavaScript can't read it) and `SameSite=Lax`.

## Using the session

Inside a controller, `session` works like a hash with `String` keys:

```
# user.id is an Int64
session["user_id"] = user.id # write
session["user_id"]?          # read, nil if missing
session["user_id"]           # read, raises KeyError if missing
session.has_key?("user_id")  # check
session.delete("user_id")    # remove one key
session["user_id"] = nil     # also removes the key
session.clear                # remove everything
```

Values must be `String`, `Int64`, `Float64` or `Bool`. Other types don't compile, so convert them first. For example, use `42_i64` or `id.to_i64` rather than an `Int32`, and `uuid.to_s` for a `UUID`.

Reading a value returns the union type `String | Int64 | Float64 | Bool`. Use `.as(T)` or a `case` to get the type you stored:

```
if user_id = session["user_id"]?.as(Int64?)
  @current_user = User.find(user_id)
end
```

### Loading the current user in a filter

A common pattern is to load the user in a [filter](https://spider-gazelle.net/guides/filters/index.md) on your base controller:

```
abstract class Application < AC::Base
  getter! current_user : User

  @[AC::Route::Filter(:before_action)]
  def authenticate
    user_id = session["user_id"]?.as(Int64?)
    return head :unauthorized unless user_id
    @current_user = User.find(user_id)
  end
end
```

## How sessions are stored

- **Lazy loading.** The cookie is only decrypted the first time a route calls `session`. Routes that never touch the session pay nothing, so there's no need to turn sessions off.
- **Written when modified.** The cookie is only sent back if the session changed. `session.touch` marks it as changed without changing any data, which refreshes the cookie's expiry.
- **Written with the response.** The cookie is set when the response is rendered. Changes made after that, for example in an `after_action` filter, aren't saved.
- **Clearing.** `session.clear` on an existing session sends an empty cookie that expires immediately, which removes it from the browser.
- **Size limit.** An encoded session larger than 4096 bytes raises `ActionController::CookieSizeExceeded`. Encryption adds overhead, so the usable space is closer to 3 KB. Store IDs and look the data up, rather than storing the data itself.
- **WebSockets.** [WebSocket routes](https://spider-gazelle.net/guides/websockets/index.md) can read the session, but don't write it, because there's no HTTP response to carry the cookie.

Warning

The session is a cookie, so the user can delete it or replay an old copy of it. Don't store anything there that must be revoked server side, such as a permission that can be taken away. Store an ID and check it on each request.

### Per-request cookie domain

`session.domain` overrides the configured `domain` for the current request. This is useful for apps that serve several domains:

```
@[AC::Route::Filter(:before_action)]
def set_session_domain
  session.domain = request.hostname
end
```

## Cookies

For data that isn't part of the session, use cookies directly.

- `cookies` returns the cookies the client **sent** with the request.
- `response.cookies` holds the cookies to **send** back.

Setting a value on `cookies` doesn't send it to the client. Always use `response.cookies` to set or delete a cookie.

```
class Preferences < AC::Base
  base "/preferences"

  # Returns the user's theme
  @[AC::Route::GET("/theme")]
  def theme : String
    cookies["theme"]?.try(&.value) || "light"
  end

  # Remembers the user's theme for a year
  @[AC::Route::POST("/theme/:theme")]
  def set_theme(theme : String) : String
    response.cookies << HTTP::Cookie.new(
      "theme", theme,
      path: "/",
      max_age: 365.days,
      http_only: true,
      samesite: :lax,
    )
    theme
  end

  # Forgets the theme
  @[AC::Route::DELETE("/theme")]
  def reset_theme : Nil
    cookie = HTTP::Cookie.new("theme", "", path: "/")
    cookie.expire
    response.cookies << cookie
  end
end
```

`cookies["name"]?` returns an [`HTTP::Cookie`](https://crystal-lang.org/api/latest/HTTP/Cookie.html), so call `.value` to get the string. `cookie.expire` clears the value and sets an expiry in the past, which tells the browser to delete it. The `path` (and `domain`) must match the cookie you're deleting.

Plain cookies aren't encrypted or signed. Treat their values as untrusted input.

## Testing sessions

The [spec client](https://spider-gazelle.net/guides/testing/index.md) doesn't keep cookies between requests. Copy them from the response yourself:

```
client = AC::SpecHelper.client

response = client.post("/session/?username=steve&password=secret")
headers = HTTP::Headers.new
response.cookies.add_request_headers(headers)

client.get("/session/", headers: headers).body
# => {"user_id":42,"username":"steve"}
```

## See also

- [Filters](https://spider-gazelle.net/guides/filters/index.md), for authentication checks
- [Configuration](https://spider-gazelle.net/getting_started/configuration/index.md), for the session environment variables
- [WebSockets](https://spider-gazelle.net/guides/websockets/index.md)
- [Testing](https://spider-gazelle.net/guides/testing/index.md)
