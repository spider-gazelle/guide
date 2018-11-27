# View Templates

Views are managed by default by [kilt](https://github.com/jeromegn/kilt) which allows you to pick between a number of template formats. We recommend reading about Crystal Langs default templating language: [ECR](https://crystal-lang.org/api/latest/ECR.html).


## Rendering

Views are rendered with access to variables in the scope of the calling function. Consider the following:

```crystal
class Welcome < Application
  def index
    welcome_text = "You're being trampled by Spider-Gazelle!"

    respond_with do
      html Kilt.render("src/views/welcome.ecr")
      json({welcome: welcome_text})
    end
  end
end

```

The variable `welcome_text` is made available inside `src/views/welcome.ecr`


## Helper Methods

To keep things DRY there are helper methods that let you define layouts and base paths for all your templates.
The files being referenced default to the `src/views` folder, however this is customisable for every controller.

```crystal
class Welcome < Application
  layout "default_layout.ecr"

  def index
    welcome_text = "You're being trampled by Spider-Gazelle!"

    respond_with do
      html template("welcome.ecr")
      json({welcome: welcome_text})
    end
  end
end

```

If you would like to only render a portion of the page, you can skip rendering the layout using the `partial` macro

```crystal
class Welcome < Application
  layout "default_layout.ecr"

  def show
    id = params["id"]
    render html: partial("single_row.ecr")
  end
end

```


### Layouts

Layouts wrap the current template, you need to specify where the `content` is to be placed

```html
<!DOCTYPE html>
<html>
<head>
	<title>Example Layout</title>
</head>
<body>
	<%= content %>
	<%= partial "sidebar.ecr" %>
</body>
</html>
```


### Changing default directories

Using `template_path` you can define the directory layouts and templates will load from.


```crystal
class Application < ActionController::Base
  # Set the default path and layout for all controllers that inherit this class
  template_path "./src/views/logged_in"
  layout "primary_layout.ecr"
end

class Welcome < Application
  # Change the base directory and layout for all views in this controller
  template_path "./src/views/welcome"
  layout "landing_page_layout.ecr"

  def index
    render html: template("welcome.ecr")
  end

  def show
    id = params["id"]

    # Overwrite the default layout for this request
    render html: template("about_us.ecr", layout: "details_layout.ecr")
  end
end

```
