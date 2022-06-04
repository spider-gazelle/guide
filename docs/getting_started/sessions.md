Your application can have a session for each user in which you can store small amounts of data that will be persisted between requests.
The session is only available in the controller and is stored using Cookies.

The cookie data is cryptographically signed to make it tamper-proof. And it is also encrypted so anyone with access to it can't read its contents. (Spider-Gazelle will not accept it if it has been edited).

* The session cookie can store around 4kB of data.
* Storing large amounts of data in the session is discouraged.
* Typically store a user or session id in the session - which can be used to retrieve required data

### Configuration

Spider-Gazelle sets up a session key (the name of the cookie) and session secret when signing the session data.
These can be changed in your applications `config.cr` file.

### Accessing the session

In your controller you can access the session through the `session` instance method.

> Sessions are lazily loaded. If you don't access sessions in your action's code, they will not be loaded. Hence you will never need to disable sessions, just not accessing them will do the job.

Session values are stored using key/value pairs like a hash:

```crystal
class Application < ActionController::Base

  # Finds the User with the ID stored in the session with the key
  # "current_user_id" This is a common way to handle user login in
  # a Spider-Gazelle application; logging in sets the session value
  # and logging out removes it.
  def current_user
    @current_user ||= session["user_id"]? &&
      User.find(session["user_id"])
  end
end

```

To store something in the session, just assign it to the key like a hash:

```crystal
class LoginController < Application
  # "Create" a login, aka "log the user in"
  @[AC::Route::POST("/")]
  def create(username : String, password : String) : Nil
    if user = User.authenticate(username, password)
      # Save the user ID in the session so it can be used in
      # subsequent requests
      session["user_id"] = user.id
    end
  end
end

```

To remove something from the session, assign that key to be `nil`:

```crystal
class LoginController < Application
  # "Delete" a login, aka "log the user out"
  @[AC::Route::DELETE("/")]
  def destroy
    # Remove the user id from the session
    @current_user = session[:user_id] = nil
  end
end
```

To reset the entire session, use `session.clear`.

## Cookies

Your application can store small amounts of data on the client - called cookies - that will be persisted across requests and even sessions.
Spider-Gazelle provides easy access to cookies via the `cookies` method, which - much like the `session` - works like a hash:

```crystal
class CommentsController < Application

  @[AC::Route::GET("/new")]
  def new
    # Auto-fill the commenter's name if it has been stored in a cookie
    comment = Comment.new(author: cookies["commenter_name"])
    comment
  end

  @[AC::Route::POST("/", body: :comment)]
  def create(comment : Comment, remember_name : Bool = false)
    comment.save!
    if remember_name
      # Remember the commenter's name.
      cookies["commenter_name"] = comment.author
    else
      # Delete cookie for the commenter's name cookie, if any.
      cookies.delete("commenter_name")
    end
    comment
  end

end

```
