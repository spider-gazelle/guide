# Defining Routes

Controllers describe and handle routes.


## CRUD, Verbs, and Actions

In Spider-Gazelle, a resourceful route provides a mapping between HTTP verbs and URLs to
controller actions. By convention, each action also maps to a specific CRUD operation in
a database.

```crystal
class MyPhotos < Application
  # base route defaults to the class name underscored
  # base 'my_photos'

  # GET /my_photos/
  def index; end

  # POST /my_photos/
  def create; end

  # GET /my_photos/:id
  def show; end
end

```

The methods defined by the `MyPhotos` class define the routes that will be created.
These are the routes that will be auto-generated if you define the appropriate method.

| HTTP Verb | Path                  | `Controller#Action` | Used for                                     |
| --------- | --------------------- | ------------------- | -------------------------------------------- |
| GET       | `/my_photos/`         | `my_photos#index`   | display a list of all your photos            |
| GET       | `/my_photos/new`      | `my_photos#new`     | return an HTML form for creating a new photo |
| POST      | `/my_photos/`         | `my_photos#create`  | create a new photo                           |
| GET       | `/my_photos/:id`      | `my_photos#show`    | display a specific photo                     |
| GET       | `/my_photos/:id/edit` | `my_photos#edit`    | return an HTML form for editing a photo      |
| PATCH     | `/my_photos/:id`      | `my_photos#update`  | update a specific photo (possibly meta data) |
| PUT       | `/my_photos/:id`      | `my_photos#replace` | replace a specific photo                     |
| DELETE    | `/my_photos/:id`      | `my_photos#destroy` | delete a specific photo                      |

> Because the router uses the HTTP verb and URL to match inbound requests, four URLs map to eight different actions.


## Adding More RESTful Actions 

You are not limited to the eight routes that RESTful routing creates by default.
If you like, you may add additional routes.

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

  # GET /
  def index; end
end

```

Or to define a complex route

```crystal
class Features < Application
  base "/my_photos/:photo_id/features"

  # GET /my_photos/:photo_id/features/
  def index; end

  # GET /my_photos/:photo_id/features/:id
  def show; end

  # POST /my_photos/:photo_id/features/
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


## Inspecting routes

To get a complete list of the available routes in your application
execute the `./app --routes` command in your terminal.

