## Route descriptions

Summary and descriptions are extracted from the comments above the function that represents the route.

* the first line of the comment is used as a summary
* if there are multiple lines then all the lines are used as a description

```crystal

class Comments < AC::Base
  base "/comments"

  # This is a route summary
  @[AC::Route::GET("/")]
  def index; end

  # This is a route summary
  # This is a route description
  # and the description continued
  @[AC::Route::POST("/")]
  def create; end
end

```

## Map POST data

```crystal

class Articles < AC::Base
  base "/articles"

  @[AC::Route::Post("/", body: :article)]
  def create(article : Article); end
end

```
