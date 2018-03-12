# Controllers Overview

Action Controller is the C in [MVC](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller).
After the router has determined which controller to use for a request, the controller is responsible for making sense of the request, and producing the appropriate output.
Luckily, Action Controller does most of the groundwork for you and uses smart conventions to make this as straightforward as possible.

For most conventional [RESTful](https://en.wikipedia.org/wiki/Representational_state_transfer) applications,
the controller will receive the request (this is invisible to you as the developer), fetch or save data from a model and generate a response (the view).
If your controller needs to do things a little differently, that's not a problem, this is just the most common way for a controller to work.

A controller can thus be thought of as a middleman between models and views.
It makes the model data available to the view so it can display that data to the user, and it saves or updates user data to the model.

NOTE: For more details on the routing process, see [Routing](controllers/routing.md).


## Methods and actions

A controller is a Crystal class which inherits from `ApplicationController` and has methods just like any other class. When your application receives a request, the routing will determine which controller and action to run, then Spider-Gazelle creates an instance of that controller and runs the method with the same name as the action.

As an example, if a user goes to `/clients/new` in your application to add a new client, Spider-Gazelle will create an instance of `ClientsController` and call its `new` method. The `new` method could make available to the view a `client` variable by creating a new `Client`:

```crystal
class ClientsController < Application
  def new
    @client = Client.new
    render html: Kilt.render("src/views/clients/new.ecr")
  end
end

```


`ApplicationController` inherits from `ActionController::Base`, which defines a number of helpful methods. This guide will cover most of these.

Only public methods are callable as actions. It is a best practice to lower the visibility of methods (with `private` or `protected`) which are not intended to be actions, like auxiliary methods or filters.


## Parameters

You will probably want to access data sent in by the user or other parameters in your controller actions.
There are two kinds of parameters possible in a web application.
The first are parameters that are sent as part of the URL, called query string parameters.
The query string is everything after `"?"` in the URL. The second type of parameter is usually referred to as POST data.
This information usually comes from an HTML form which has been filled in by the user. It's called POST data because it can only be sent as part of an HTTP POST request.

Spider-Gazelle does not make any distinction between query string parameters and POST parameters, and both are available in the `params` hash in your controller:

```crystal
class ClientsController < Application
  # This action uses query string parameters because it gets run
  # by an HTTP GET request, but this does not make any difference
  # to the way in which the parameters are accessed. The URL for
  # this action would look like this in order to list activated
  # clients: /clients?status=activated
  def index
    if params["status"]? == "activated"
      @clients = Client.activated
    else
      @clients = Client.inactivated
    end

    render json: @clients
  end

  # This action uses POST parameters. They are most likely coming
  # from an HTML form which the user has submitted. The URL for
  # this RESTful request will be "/clients", and the data will be
  # sent as part of the request body.
  def create
    @client = Client.new(name: params["client_name"])
    if @client.save
      redirect_to ClientsController.show(@client.id)
    else
      render html: Kilt.render("src/views/clients/new.ecr")
    end
  end
end

```


## Routing parameters

Parameters defined by the routing, such as `:id`, will also be available in `params` hash.

As an example, consider a listing of clients where the list can show either active or inactive clients.
We can add a route which captures the status parameter in a "pretty" URL:

```crystal
class ClientsController < Application
  get "/:status", :inline_status do
    # call the index method defined above
    index
  end
end

```

In this case, when a user opens the URL `/clients/active`, `params["status"]` will be set to `"active"`.

### Current request

To inspect the current action name for a request you can call `action_name`

```crystal
class ClientsController < Application
  def index
    action = action_name # => :index : Symbol
    render text: action
  end

  get "/:status", :inline_status do
    action = action_name # => :inline_status : Symbol
    render text: action
  end
end

```


## JSON parameters

If you're writing a web service application, you might find yourself more comfortable accepting parameters in JSON format.

Spider-Gazelle does not automatically parse the JSON provided for performance and security reasons.
It is recommended to use [JSON mappings](https://crystal-lang.org/api/latest/JSON.html) which defines what you are expecting to safely parse the request data.

ActiveModel classes generate JSON mappings making it simple to consume JSON efficiently and safely.

```crystal
class ClientsController < Application

  class ReqData < ActiveModel::Model
    attribute birthday : Time, converter: Time::EpochConverter
    attribute name : String
    attribute years_experience : Int32 = 5
    attribute accept_conditions : Bool = true
  end

  def create
    req = ReqData.from_json(request.body.not_nil!)
    # You can now access the valid JSON data via req
  end
end

```


## Session

Your application has a session for each user in which you can store small amounts of data that will be persisted between requests.
The session is only available in the controller and the view and is stored using Cookies.

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

  private

  # Finds the User with the ID stored in the session with the key
  # "current_user_id" This is a common way to handle user login in
  # a Spider-Gazelle application; logging in sets the session value
  # and logging out removes it.
  def current_user
    @_current_user ||= session["current_user_id"]? &&
      User.find(session["current_user_id"])
  end
end

```

To store something in the session, just assign it to the key like a hash:

```crystal
class LoginsController < Application
  # "Create" a login, aka "log the user in"
  def create
    if user = User.authenticate(params[:username], params[:password])
      # Save the user ID in the session so it can be used in
      # subsequent requests
      session["current_user_id"] = user.id
      redirect_to "/"
    end
  end
end

```

To remove something from the session, assign that key to be `nil`:

```crystal
class LoginsController < Application
  # "Delete" a login, aka "log the user out"
  def destroy
    # Remove the user id from the session
    @_current_user = session[:current_user_id] = nil
    redirect_to "/"
  end
end
```

To reset the entire session, use `session.clear`.


## Cookies

Your application can store small amounts of data on the client - called cookies - that will be persisted across requests and even sessions.
Spider-Gazelle provides easy access to cookies via the `cookies` method, which - much like the `session` - works like a hash:

```crystal
class CommentsController < Application
  def new
    # Auto-fill the commenter's name if it has been stored in a cookie
    @comment = Comment.new(author: cookies["commenter_name"])
    render html: Kilt.render("src/views/comments/new.ecr")
  end

  def create
    @comment = Comment.from_json(request.body)
    if @comment.save
      if params["remember_name"]
        # Remember the commenter's name.
        cookies["commenter_name"] = @comment.author
      else
        # Delete cookie for the commenter's name cookie, if any.
        cookies.delete("commenter_name")
      end
      redirect_to ArticlesController.show(@comment.article_id)
    else
      new
    end
  end
end

```


## Rendering XML and JSON data

ActionController makes it extremely easy to render `XML` or `JSON` data.
The `respond_with` method uses the [Accept header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept) to select the response type.

```crystal
class UsersController < Application
  def index
    @users = User.all

    respond_with do
      html Kilt.render("src/views/users/index.ecr")
      json @users
      xml do
        XML.build(indent: "  ") do |xml|
          @users.each do |user|
            xml.element("user") { xml.text user.name }
          end
        end
      end
    end
  end
end

```

Spider-Gazelle will automatically call `.to_json` for JSON responses unless the object is a string already.
It also expects blocks, such as the XML builder, to return a string.


## Filters

Filters are methods that are run "before", "after" or "around" a controller action.

Filters are inherited, so if you set a filter on `Application`, it will be run on every controller in your application.

"before" filters may halt the request cycle. A common "before" filter is one which requires that a user is logged in for an action to be run. You can define the filter method this way:

```crystal
class Application < ActionController::Base
  before_action :require_login

  private

  def require_login
    unless logged_in?
      # halts request cycle
      redirect_to AuthController.login
    end
  end
end

```

If a "before" filter renders or redirects, the action will not run.
If there are additional filters scheduled to run after that filter, they are also cancelled.

In this example the filter is added to `Application` and thus all controllers in the application inherit it.
This will make everything in the application require the user to be logged in in order to use it.
For obvious reasons (the user wouldn't be able to log in in the first place!), not all controllers or actions should require this.
You can prevent filters from running before particular actions with `skip_action`:

```crystal
class LoginsController < Application
  skip_action :require_login, only: [:new, :create]
end

```

Now, the `LoginsController`'s `new` and `create` actions will work as before without requiring the user to be logged in.
The `:only` option is used to skip this filter only for these actions, and there is also an `:except` option which works the other way.
These options can be used when adding filters too, so you can add a filter which only runs for selected actions in the first place.


### After filters and around filters

In addition to "before" filters, you can also run filters after an action has been executed, or both before and after.

"after" filters are similar to "before" filters, but because the action has already been run they have access to the response data that's about to be sent to the client. Obviously, "after" filters cannot stop the action from running. Please note that "after" filters are executed only after a successful action, but not when an exception is raised in the request cycle.

"around" filters are responsible for running their associated actions by yielding.

For example, in a website where changes have an approval workflow an administrator could be able to preview them easily, just apply them within a transaction:

```crystal
class ChangesController < Application
  around_action :wrap_in_transaction, only: :show

  private

  def wrap_in_transaction
    Change.transaction do
      begin
        yield
      ensure
        raise Rollback
      end
    end
  end
end
```

Note that an "around" filter also wraps rendering. In particular, if in the example above, the view itself reads from the database (e.g. via a scope), it will do so within the transaction and thus present the data to preview.

You can choose not to yield and build the response yourself, in which case the action will not be run.


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


## Rescue

Most likely your application is going to contain bugs or otherwise throw an exception that needs to be handled.
Spider-Gazelle default exception handling displays a "500 Server Error" message for exceptions or a "404 Not Found" if there was a routing error.

### Rescue from

If you want to do something a bit more elaborate when catching errors, you can use `rescue_from`, which handles exceptions of a certain type (or multiple types) in an entire controller and its subclasses.

When an exception occurs which is caught by a `rescue_from` directive, the exception object is passed to the handler. The handler can be a method or you can use a block directly.

Here's how you can use `rescue_from` to intercept all `RecordNotFound` errors and do something with them.

```crystal
class Application < ActionController::Base
  rescue_from RecordNotFound, with: :record_not_found

  private

    def record_not_found
      render :not_found, text: "404 Not Found"
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

Just like the filter, you could also pass `:only` and `:except` to enforce the secure connection only to specific actions:

```crystal
class DinnerController < Application
  force_ssl only: :cheeseburger
  # or
  force_ssl except: :cheeseburger
end

```

Please note that if you find yourself adding `force_ssl` to many controllers, you may want to force the whole application to use HTTPS instead.
